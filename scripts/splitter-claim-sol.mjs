#!/usr/bin/env node
// Claim SOL from splitter pool as a member
import fs from 'node:fs';
import path from 'node:path';
import * as anchor from '@coral-xyz/anchor';
import { PublicKey, Connection, SystemProgram } from '@solana/web3.js';
import idl from '../src/solana/idl/ibom_splitter.json' assert { type: 'json' };

function arg(name, def) { const i=process.argv.indexOf(name); return i>=0 && i+1<process.argv.length?process.argv[i+1]:def; }
function loadKeypair(p){ const raw=fs.readFileSync(p,'utf8'); const arr=JSON.parse(raw); return anchor.web3.Keypair.fromSecretKey(new Uint8Array(arr)); }

async function main(){
  const url = arg('--url', process.env.SOLANA_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com');
  const kpPath = arg('--keypair', process.env.SOLANA_KEYPAIR || path.join(process.env.HOME, '.config/solana/id.json'));
  const programIdStr = arg('--program-id', process.env.NEXT_PUBLIC_SPLITTER_PROGRAM_ID || 'E11111111111111111111111111111111111111111');
  const workStr = arg('--work');
  if (!workStr) throw new Error('Missing --work <WorkPDA>');
  const registryWork = new PublicKey(workStr);
  const walletKp = loadKeypair(kpPath);
  const wallet = new anchor.Wallet(walletKp);
  const conn = new Connection(url, 'confirmed');
  const provider = new anchor.AnchorProvider(conn, wallet, { commitment:'confirmed' });
  anchor.setProvider(provider);
  const programId = new PublicKey(programIdStr);
  const program = new anchor.Program({ ...(idl), address: programId.toBase58() }, provider);

  const member = wallet.publicKey;
  const [poolPda]=PublicKey.findProgramAddressSync([Buffer.from('pool'), member.toBuffer(), registryWork.toBuffer()], program.programId);
  console.log('Member  :', member.toBase58());
  console.log('Pool PDA:', poolPda.toBase58());
  await program.methods
    .claimSol()
    .accounts({ member, pool: poolPda, systemProgram: SystemProgram.programId })
    .rpc();
  console.log('claim_sol done');
}

main().catch(e=>{ console.error('Error:', e.message||e); process.exit(1); });

