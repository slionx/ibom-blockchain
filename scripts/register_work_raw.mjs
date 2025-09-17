#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } from '@solana/web3.js';
import { randomBytes, createHash } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

function loadEnv() {
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

function getKeypair() {
  const p = process.env.REGISTRY_AUTHORITY_KEYPAIR_PATH || resolve(process.env.HOME || '.', '.config/solana/id.json');
  const arr = JSON.parse(readFileSync(p, 'utf8'));
  return Keypair.fromSecretKey(Uint8Array.from(arr));
}

function bytes32FromHexOrRandom(hex) {
  if (hex && /^[0-9a-fA-F]{64}$/.test(hex)) {
    const out = Buffer.alloc(32);
    Buffer.from(hex, 'hex').copy(out);
    return out;
  }
  return randomBytes(32);
}

function discriminator(name) {
  const preimage = `global:${name}`;
  const hash = createHash('sha256').update(preimage).digest();
  return hash.subarray(0, 8);
}

function encodeString(s) {
  const b = Buffer.from(s, 'utf8');
  const len = Buffer.alloc(4);
  len.writeUInt32LE(b.length, 0);
  return Buffer.concat([len, b]);
}

function encodeCreators(list) {
  const len = Buffer.alloc(4);
  len.writeUInt32LE(list.length, 0);
  const items = list.map((c) => {
    const pk = new PublicKey(c.address).toBuffer();
    const share = Buffer.alloc(2); // u16
    share.writeUInt16LE(Number(c.share), 0);
    return Buffer.concat([pk, share]);
  });
  return Buffer.concat([len, ...items]);
}

function workPda(programId, authority, workIdBuf) {
  const [pda] = PublicKey.findProgramAddressSync([
    Buffer.from('work'), authority.toBuffer(), workIdBuf
  ], programId);
  return pda;
}

async function main() {
  loadEnv();
  const RPC = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
  const programId = new PublicKey(process.env.REGISTRY_PROGRAM_ID || process.env.NEXT_PUBLIC_REGISTRY_PROGRAM_ID);
  const kp = getKeypair();
  const connection = new Connection(RPC, 'confirmed');

  // build args
  const workId = bytes32FromHexOrRandom(process.env.WORK_ID_HEX);
  const fingerprint = bytes32FromHexOrRandom(process.env.FINGERPRINT_HEX);
  const metadataUri = process.env.METADATA_URI || 'ipfs://demo.work.json';
  const creators = [{ address: kp.publicKey.toBase58(), share: 10000 }];

  const data = Buffer.concat([
    discriminator('register_work'),
    workId,
    encodeString(metadataUri),
    fingerprint,
    encodeCreators(creators),
  ]);

  const pda = workPda(programId, kp.publicKey, workId);
  const ix = new TransactionInstruction({
    programId,
    keys: [
      { pubkey: kp.publicKey, isSigner: true, isWritable: true },
      { pubkey: pda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });

  const tx = new Transaction().add(ix);
  tx.feePayer = kp.publicKey;
  const sig = await connection.sendTransaction(tx, [kp], { skipPreflight: false });
  const conf = await connection.confirmTransaction(sig, 'confirmed');
  console.log(JSON.stringify({ ok: true, signature: sig, work: pda.toBase58(), authority: kp.publicKey.toBase58(), confirmation: conf.value }, null, 2));
}

main().catch((e) => { console.error(e?.stack || e); process.exit(1); });

