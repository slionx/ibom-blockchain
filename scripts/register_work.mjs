#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Connection, Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
import { AnchorProvider, Program } from '@coral-xyz/anchor';
import { randomBytes } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

function loadDotEnvLocal() {
  try {
    const p = resolve(repoRoot, '.env.local');
    const txt = readFileSync(p, 'utf8');
    for (const raw of txt.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const i = line.indexOf('=');
      if (i === -1) continue;
      const k = line.slice(0, i).trim();
      const v = line.slice(i + 1).trim();
      if (!(k in process.env)) process.env[k] = v;
    }
  } catch {}
}

function parseSecretKeyFromEnv() {
  const inline = process.env.REGISTRY_AUTHORITY_SECRET_KEY;
  const path = process.env.REGISTRY_AUTHORITY_KEYPAIR_PATH;
  if (inline) {
    try {
      const arr = JSON.parse(inline);
      if (Array.isArray(arr)) return Keypair.fromSecretKey(Uint8Array.from(arr));
    } catch {}
    try {
      const buf = Buffer.from(inline, 'base64');
      if (buf.length > 0) return Keypair.fromSecretKey(new Uint8Array(buf));
    } catch {}
  }
  const fallback = path || resolve(process.env.HOME || process.env.USERPROFILE || '.', '.config/solana/id.json');
  const raw = readFileSync(fallback, 'utf8');
  const arr = JSON.parse(raw);
  return Keypair.fromSecretKey(Uint8Array.from(arr));
}

function toBytes32HexOrRandom(label) {
  const v = process.env[label];
  if (v && /^[0-9a-fA-F]{64}$/.test(v)) {
    const out = [];
    for (let i = 0; i < 64; i += 2) out.push(parseInt(v.slice(i, i + 2), 16));
    return out;
  }
  // random
  const b = randomBytes(32);
  return Array.from(b.values());
}

function findWorkPda(programId, authority, workIdArr) {
  const [pda] = PublicKey.findProgramAddressSync([
    Buffer.from('work'),
    authority.toBuffer(),
    Buffer.from(Uint8Array.from(workIdArr)),
  ], programId);
  return pda;
}

async function main() {
  loadDotEnvLocal();

  const RPC = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
  const programIdStr = process.env.REGISTRY_PROGRAM_ID || process.env.NEXT_PUBLIC_REGISTRY_PROGRAM_ID;
  if (!programIdStr) throw new Error('Missing REGISTRY_PROGRAM_ID in env');
  const programId = new PublicKey(programIdStr);
  console.log('[debug] programId', programId.toBase58());

  const idlPathTarget = resolve(repoRoot, 'onchain/target/idl/ibom_registry.json');
  const idlPathSrc = resolve(repoRoot, 'src/solana/idl/ibom_registry.json');
  const idlPath = existsSync(idlPathTarget) ? idlPathTarget : idlPathSrc;
  const idl = JSON.parse(readFileSync(idlPath, 'utf8'));
  idl.address = programId.toBase58();
  // debug idl defined refs
  for (const ix of idl.instructions || []) {
    for (const a of ix.args || []) {
      if (a?.type?.defined) console.log('[debug] ix', ix.name, 'arg', a.name, 'defined=', a.type.defined);
      if (a?.type?.vec?.defined) console.log('[debug] ix', ix.name, 'arg', a.name, 'vec.defined=', a.type.vec.defined);
    }
  }

  const kp = parseSecretKeyFromEnv();
  const wallet = {
    publicKey: kp.publicKey,
    signTransaction: async (tx) => { tx.partialSign(kp); return tx; },
    signAllTransactions: async (txs) => { txs.forEach((t) => t.partialSign(kp)); return txs; },
  };

  const connection = new Connection(RPC, process.env.SOLANA_COMMITMENT || 'confirmed');
  const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  console.log('[debug] idl metadata.address', idl?.metadata?.address);
  const program = new Program(idl, provider);

  // Inputs
  const workId = toBytes32HexOrRandom('WORK_ID_HEX');
  const fingerprintHash = toBytes32HexOrRandom('FINGERPRINT_HEX');
  const metadataUri = process.env.METADATA_URI || 'ipfs://demo.work.json';
  const creators = [{ pubkey: kp.publicKey, share: 10000 }];

  const pda = findWorkPda(program.programId, kp.publicKey, workId);
  const sig = await program.methods
    .registerWork(workId, metadataUri, fingerprintHash, creators)
    .accounts({ authority: kp.publicKey, work: pda, systemProgram: SystemProgram.programId })
    .rpc();

  console.log(JSON.stringify({ ok: true, signature: sig, work: pda.toBase58(), authority: kp.publicKey.toBase58() }, null, 2));
}

main().catch((e) => { console.error(e?.stack || e); process.exit(1); });
