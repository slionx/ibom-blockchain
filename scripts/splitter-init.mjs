#!/usr/bin/env node
// Initialize a SOL splitter pool from registry work and shares
import fs from 'node:fs';
import path from 'node:path';
import * as anchor from '@coral-xyz/anchor';
import { PublicKey, Connection, SystemProgram } from '@solana/web3.js';
import idl from '../src/solana/idl/ibom_splitter.json' assert { type: 'json' };

function arg(name, def) {
  const i = process.argv.indexOf(name);
  if (i >= 0 && i + 1 < process.argv.length) return process.argv[i + 1];
  return def;
}
function loadKeypair(p) {
  const raw = fs.readFileSync(p, 'utf8');
  const arr = JSON.parse(raw);
  return anchor.web3.Keypair.fromSecretKey(new Uint8Array(arr));
}
function parseShares(s) {
  // "addr1:7000,addr2:3000"
  if (!s) return [];
  return s.split(',').map((part) => {
    const [addr, bp] = part.split(':');
    return { pubkey: new PublicKey(addr.trim()), bp: Number(bp || 0) };
  });
}

async function main() {
  const url = arg('--url', process.env.SOLANA_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com');
  const kpPath = arg('--keypair', process.env.SOLANA_KEYPAIR || path.join(process.env.HOME, '.config/solana/id.json'));
  const programIdStr = arg('--program-id', process.env.NEXT_PUBLIC_SPLITTER_PROGRAM_ID || 'E11111111111111111111111111111111111111111');
  const workStr = arg('--work');
  const sharesStr = arg('--shares');
  if (!workStr) throw new Error('Missing --work <WorkPDA>');
  if (!sharesStr) throw new Error('Missing --shares "addr1:bp,addr2:bp"');
  const registryWork = new PublicKey(workStr);
  const shares = parseShares(sharesStr);
  const walletKp = loadKeypair(kpPath);
  const wallet = new anchor.Wallet(walletKp);
  const conn = new Connection(url, 'confirmed');
  const provider = new anchor.AnchorProvider(conn, wallet, { commitment: 'confirmed' });
  anchor.setProvider(provider);
  const programId = new PublicKey(programIdStr);
  const idlWithAddr = { ...(idl), address: programId.toBase58() };
  const program = new anchor.Program(idlWithAddr, provider);

  const authority = wallet.publicKey;
  const [poolPda] = PublicKey.findProgramAddressSync([Buffer.from('pool'), authority.toBuffer(), registryWork.toBuffer()], program.programId);

  console.log('Authority:', authority.toBase58());
  console.log('Program  :', program.programId.toBase58());
  console.log('Work     :', registryWork.toBase58());
  console.log('Pool PDA :', poolPda.toBase58());
  console.log('Shares   :', shares.map((s) => `${s.pubkey.toBase58()}:${s.bp}`).join(','));

  await program.methods
    .initPool(registryWork, null, shares)
    .accounts({ authority, pool: poolPda, systemProgram: SystemProgram.programId })
    .rpc();

  console.log('init_pool done');
}

main().catch((e) => { console.error('Error:', e.message || e); process.exit(1); });

