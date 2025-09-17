use anchor_lang::prelude::*;

declare_id!("6rozMzrUPYqBkvmrc5VXJEP2d4Kc4AK1oXz9PDi8bBas");

pub const MAX_URI_LEN: usize = 200;
pub const MAX_CREATORS: usize = 10;

#[program]
pub mod ibom_registry {
    use super::*;

    pub fn register_work(
        ctx: Context<RegisterWork>,
        work_id: [u8; 32],
        metadata_uri: String,
        fingerprint_hash: [u8; 32],
        creators: Vec<CreatorShare>,
    ) -> Result<()> {
        require!(metadata_uri.as_bytes().len() <= MAX_URI_LEN, RegistryError::UriTooLong);
        require!(creators.len() <= MAX_CREATORS, RegistryError::TooManyCreators);
        let sum: u32 = creators.iter().map(|c| c.share as u32).sum();
        require!(sum == 10_000, RegistryError::InvalidSharesSum);

        let work = &mut ctx.accounts.work;
        work.bump = ctx.bumps.work;
        work.authority = ctx.accounts.authority.key();
        work.work_id = work_id;
        work.metadata_uri = metadata_uri;
        work.fingerprint_hash = fingerprint_hash;
        work.creators = creators;
        work.registered_at = Clock::get()?.unix_timestamp;
        work.version = 1;
        Ok(())
    }

    pub fn update_work(
        ctx: Context<UpdateWork>,
        metadata_uri: String,
        fingerprint_hash: [u8; 32],
        creators: Vec<CreatorShare>,
    ) -> Result<()> {
        require!(metadata_uri.as_bytes().len() <= MAX_URI_LEN, RegistryError::UriTooLong);
        require!(creators.len() <= MAX_CREATORS, RegistryError::TooManyCreators);
        let sum: u32 = creators.iter().map(|c| c.share as u32).sum();
        require!(sum == 10_000, RegistryError::InvalidSharesSum);

        let work = &mut ctx.accounts.work;
        work.metadata_uri = metadata_uri;
        work.fingerprint_hash = fingerprint_hash;
        work.creators = creators;
        work.version = work.version.saturating_add(1);
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(work_id: [u8; 32])]
pub struct RegisterWork<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        space = Work::space(),
        seeds = [b"work", authority.key().as_ref(), &work_id],
        bump
    )]
    pub work: Account<'info, Work>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateWork<'info> {
    pub authority: Signer<'info>,
    #[account(
        mut,
        has_one = authority,
        seeds = [b"work", work.authority.as_ref(), &work.work_id],
        bump = work.bump,
    )]
    pub work: Account<'info, Work>,
}

#[account]
pub struct Work {
    pub bump: u8,
    pub authority: Pubkey,
    pub work_id: [u8; 32],
    pub metadata_uri: String,       // <= MAX_URI_LEN
    pub fingerprint_hash: [u8; 32],
    pub creators: Vec<CreatorShare>, // <= MAX_CREATORS
    pub registered_at: i64,
    pub version: u32,
}

impl Work {
    pub fn space() -> usize {
        // discriminator + bump + authority + work_id + uri + fingerprint + creators vec + registered_at + version
        const DISCRIMINATOR: usize = 8;
        const BUMP: usize = 1;
        const PUBKEY: usize = 32;
        const BYTES32: usize = 32;
        const I64: usize = 8;
        const U32: usize = 4;
        const CREATOR: usize = PUBKEY + 2; // pubkey + u16 share

        DISCRIMINATOR
            + BUMP
            + PUBKEY
            + BYTES32
            + U32 + MAX_URI_LEN
            + BYTES32
            + U32 + (MAX_CREATORS * CREATOR)
            + I64
            + U32
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct CreatorShare {
    pub pubkey: Pubkey,
    pub share: u16, // basis points, sum must equal 10_000
}

#[error_code]
pub enum RegistryError {
    #[msg("metadata_uri exceeds MAX_URI_LEN")] 
    UriTooLong,
    #[msg("creators length exceeds MAX_CREATORS")] 
    TooManyCreators,
    #[msg("sum(creators.share) must equal 10000 basis points")] 
    InvalidSharesSum,
}
