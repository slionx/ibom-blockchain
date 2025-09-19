use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};

declare_id!("63GQo7QyXMRzcjjhTHhccUDvjQLaDAvM4j9Avz45Y3iC");

pub const MAX_MEMBERS: usize = 10;

#[program]
pub mod ibom_splitter {
    use super::*;

    pub fn init_pool(
        ctx: Context<InitPool>,
        registry_work: Pubkey,
        token_mint: Option<Pubkey>,
        shares: Vec<MemberShare>,
    ) -> Result<()> {
        require!(shares.len() <= MAX_MEMBERS, SplitterError::TooManyMembers);
        let sum: u32 = shares.iter().map(|s| s.bp as u32).sum();
        require!(sum == 10_000, SplitterError::InvalidSharesSum);
        let pool = &mut ctx.accounts.pool;
        pool.bump = ctx.bumps.pool;
        pool.authority = ctx.accounts.authority.key();
        pool.registry_work = registry_work;
        pool.token_mint = token_mint;
        pool.shares = shares;
        pool.total_received = 0;
        pool.claimed = Vec::new();
        pool.version = 1;
        Ok(())
    }

    pub fn fund_sol(ctx: Context<FundSol>, amount: u64) -> Result<()> {
        require!(amount > 0, SplitterError::InvalidAmount);
        let pool = &mut ctx.accounts.pool;
        let payer = &ctx.accounts.payer;
        let cpi_ctx = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            Transfer {
                from: payer.to_account_info(),
                to: pool.to_account_info(),
            },
        );
        transfer(cpi_ctx, amount)?;
        pool.total_received = pool.total_received.saturating_add(amount);
        Ok(())
    }

    pub fn claim_sol(ctx: Context<ClaimSol>) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        require!(pool.token_mint.is_none(), SplitterError::WrongPoolKind);
        let member = ctx.accounts.member.key();
        // find share
        let share_bp = pool
            .shares
            .iter()
            .find(|s| s.pubkey == member)
            .map(|s| s.bp as u128)
            .ok_or(SplitterError::NotAMember)?;

        let entitled: u128 = (pool.total_received as u128) * share_bp / 10_000u128;
        let already_claimed: u128 = pool
            .claimed
            .iter()
            .find(|c| c.pubkey == member)
            .map(|c| c.amount as u128)
            .unwrap_or(0);
        require!(entitled > already_claimed, SplitterError::NothingToClaim);
        let payable: u64 = (entitled - already_claimed) as u64;

        // transfer lamports from pool (PDA) to member
        let pool_seeds: &[&[u8]] = &[b"pool", pool.authority.as_ref(), pool.registry_work.as_ref(), &[pool.bump]];
        let signer = &[&pool_seeds[..]];
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            Transfer {
                from: pool.to_account_info(),
                to: ctx.accounts.member.to_account_info(),
            },
            signer,
        );
        transfer(cpi_ctx, payable)?;

        // record claimed
        if let Some(c) = pool.claimed.iter_mut().find(|c| c.pubkey == member) {
            c.amount = c.amount.saturating_add(payable);
        } else {
            pool.claimed.push(MemberClaim { pubkey: member, amount: payable });
        }
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(registry_work: Pubkey)]
pub struct InitPool<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        space = Pool::space(),
        seeds = [b"pool", authority.key().as_ref(), registry_work.as_ref()],
        bump
    )]
    pub pool: Account<'info, Pool>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct FundSol<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut,
        seeds = [b"pool", pool.authority.as_ref(), pool.registry_work.as_ref()],
        bump = pool.bump,
    )]
    pub pool: Account<'info, Pool>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClaimSol<'info> {
    #[account(mut)]
    pub member: Signer<'info>,
    #[account(mut,
        seeds = [b"pool", pool.authority.as_ref(), pool.registry_work.as_ref()],
        bump = pool.bump,
    )]
    pub pool: Account<'info, Pool>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct Pool {
    pub bump: u8,
    pub authority: Pubkey,
    pub registry_work: Pubkey,
    pub token_mint: Option<Pubkey>,
    pub shares: Vec<MemberShare>,
    pub total_received: u64,
    pub claimed: Vec<MemberClaim>,
    pub version: u32,
}

impl Pool {
    pub fn space() -> usize {
        const DISCRIMINATOR: usize = 8;
        const BUMP: usize = 1;
        const PUBKEY: usize = 32;
        const U64: usize = 8;
        const U32: usize = 4;
        const OPTION_PUBKEY: usize = 1 + PUBKEY;
        const MEMBER_SHARE: usize = PUBKEY + 2; // pubkey + u16 bp
        const MEMBER_CLAIM: usize = PUBKEY + U64; // pubkey + u64 amount
        DISCRIMINATOR
            + BUMP
            + PUBKEY // authority
            + PUBKEY // registry_work
            + OPTION_PUBKEY // token_mint
            + 4 + (MAX_MEMBERS * MEMBER_SHARE) // Vec<MemberShare>
            + U64 // total_received
            + 4 + (MAX_MEMBERS * MEMBER_CLAIM) // Vec<MemberClaim>
            + U32
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct MemberShare { pub pubkey: Pubkey, pub bp: u16 }

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct MemberClaim { pub pubkey: Pubkey, pub amount: u64 }

#[error_code]
pub enum SplitterError {
    #[msg("too many members")] TooManyMembers,
    #[msg("sum(shares) must equal 10000 bp")] InvalidSharesSum,
    #[msg("invalid amount")] InvalidAmount,
    #[msg("nothing to claim")] NothingToClaim,
    #[msg("not a member")] NotAMember,
    #[msg("wrong pool kind")] WrongPoolKind,
}
