#!/usr/bin/env node
// Link NFT mint and optional collection to an existing Work (authority wallet)
import fs from 'node:fs';
import path from 'node:path';
import * as anchor from '@coral-xyz/anchor';
import { PublicKey, Connection } from '@solana/web3.js';
import idl from '../src/solana/idl/ibom_registry.json' assert { type: 'json' };

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

async function sha256Hex(input) {
  const enc = new TextEncoder();
  const data = enc.encode(input);
  const buf = await (globalThis.crypto?.subtle || (await import('node:crypto')).webcrypto.subtle).digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex) {
  return new Uint8Array(hex.match(/.{2}/g).map((h) => parseInt(h, 16)));
}

async function main() {
  const url = arg('--url', process.env.SOLANA_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com');
  const kpPath = arg('--keypair', process.env.SOLANA_KEYPAIR || path.join(process.env.HOME, '.config/solana/id.json'));
  const programIdStr = arg('--program-id', process.env.REGISTRY_PROGRAM_ID || process.env.NEXT_PUBLIC_REGISTRY_PROGRAM_ID);
  if (!programIdStr) throw new Error('Missing --program-id or REGISTRY_PROGRAM_ID');
  const nftMintStr = arg('--mint');
  if (!nftMintStr) throw new Error('Missing --mint <NFT_MINT>');
  const collectionStr = arg('--collection', null);
  let workIdHex = arg('--work-id-hex', null);
  if (!workIdHex) workIdHex = await sha256Hex(nftMintStr);
  if (!/^[0-9a-fA-F]{64}$/.test(workIdHex)) throw new Error('work-id-hex must be 64 hex chars');

  const walletKp = loadKeypair(kpPath);
  const wallet = new anchor.Wallet(walletKp);
  const conn = new Connection(url, 'confirmed');
  const provider = new anchor.AnchorProvider(conn, wallet, { commitment: 'confirmed' });
  anchor.setProvider(provider);
  const programId = new PublicKey(programIdStr);
  const idlWithAddr = { ...(idl), address: programId.toBase58() };
  const program = new anchor.Program(idlWithAddr, provider);

  const authority = wallet.publicKey;
  const nftMint = new PublicKey(nftMintStr);
  const collection = collectionStr ? new PublicKey(collectionStr) : null;
  const workId = hexToBytes(workIdHex);

  const [workPda] = PublicKey.findProgramAddressSync([Buffer.from('work'), authority.toBuffer(), Buffer.from(workId)], program.programId);

  console.log('Authority:', authority.toBase58());
  console.log('Program  :', program.programId.toBase58());
  console.log('Work PDA :', workPda.toBase58());

  const sig = await program.methods
    .linkMint(nftMint, collection)
    .accounts({ authority, work: workPda })
    .rpc();

  console.log('link_mint signature:', sig);
}

main().catch((e) => {
  console.error('Error:', e.message || e);
  process.exit(1);
});

