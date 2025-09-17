import { AnchorProvider, Idl, Program, Wallet } from "@coral-xyz/anchor";
import { PublicKey, Keypair, Connection, SystemProgram } from "@solana/web3.js";
import idl from "@/solana/idl/ibom_registry.json" assert { type: "json" };
import fs from "node:fs/promises";

export type CreatorShareInput = { address: string; share: number };

function commitment() {
  return (process.env.SOLANA_COMMITMENT || process.env.NEXT_PUBLIC_SOLANA_COMMITMENT || "confirmed") as any;
}

export function makeServerConnection() {
  const rpc = process.env.SOLANA_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com";
  return new Connection(rpc, commitment());
}

async function parseSecretKeyFromEnv(): Promise<Keypair> {
  const inline = process.env.REGISTRY_AUTHORITY_SECRET_KEY;
  const path = process.env.REGISTRY_AUTHORITY_KEYPAIR_PATH;
  if (inline) {
    try {
      const arr = JSON.parse(inline);
      if (Array.isArray(arr)) {
        return Keypair.fromSecretKey(Uint8Array.from(arr));
      }
    } catch (e) {
      // not JSON array; try base64
      try {
        const buf = Buffer.from(inline, "base64");
        return Keypair.fromSecretKey(new Uint8Array(buf));
      } catch {
        // ignore
      }
    }
  }
  if (path) {
    const raw = await fs.readFile(path, "utf8");
    const arr = JSON.parse(raw);
    return Keypair.fromSecretKey(Uint8Array.from(arr));
  }
  throw new Error("Missing REGISTRY_AUTHORITY_SECRET_KEY or REGISTRY_AUTHORITY_KEYPAIR_PATH");
}

export async function makeServerWallet(): Promise<{ keypair: Keypair; wallet: Wallet }> {
  const keypair = await parseSecretKeyFromEnv();
  const wallet: Wallet = {
    publicKey: keypair.publicKey,
    async signTransaction(tx) {
      tx.partialSign(keypair);
      return tx;
    },
    async signAllTransactions(txs) {
      txs.forEach((tx) => tx.partialSign(keypair));
      return txs;
    },
  };
  return { keypair, wallet };
}

export async function makeServerProvider() {
  const connection = makeServerConnection();
  const { wallet } = await makeServerWallet();
  return new AnchorProvider(connection, wallet, { commitment: commitment() });
}

export async function makeRegistryProgram() {
  const provider = await makeServerProvider();
  const programIdStr = process.env.REGISTRY_PROGRAM_ID || process.env.NEXT_PUBLIC_REGISTRY_PROGRAM_ID;
  if (!programIdStr) throw new Error("Missing REGISTRY_PROGRAM_ID");
  const programId = new PublicKey(programIdStr);
  const idlWithAddr: any = { ...(idl as any), address: programId.toBase58() };
  const program = new Program(idlWithAddr as Idl, provider);
  return { program, provider } as const;
}

export function systemProgramPk() {
  return SystemProgram.programId;
}

export function parseBytes32(input: unknown, field: string): number[] {
  if (Array.isArray(input)) {
    if (input.length !== 32) throw new Error(`${field} array must be length 32`);
    return input.map((n) => Number(n));
  }
  if (typeof input === "string") {
    const s = input.trim();
    if (/^[0-9a-fA-F]+$/.test(s) && s.length === 64) {
      const out: number[] = [];
      for (let i = 0; i < 64; i += 2) out.push(parseInt(s.slice(i, i + 2), 16));
      return out;
    }
    // base64
    try {
      const buf = Buffer.from(s, "base64");
      if (buf.length !== 32) throw new Error(`${field} base64 must decode to 32 bytes`);
      return Array.from(buf.values());
    } catch (e) {
      throw new Error(`Invalid ${field}: expected 32-byte hex/base64 or number[32]`);
    }
  }
  throw new Error(`Invalid ${field}: expected 32-byte hex/base64 or number[32]`);
}

export function parseCreators(input: any): { pubkey: PublicKey; share: number }[] {
  if (!Array.isArray(input)) throw new Error("creators must be an array");
  return input.map((c) => {
    if (!c?.address || c.share === undefined) throw new Error("creator requires address and share");
    const pk = new PublicKey(c.address);
    const share = Number(c.share);
    if (!Number.isInteger(share) || share < 0 || share > 10000) throw new Error("creator.share must be 0..10000");
    return { pubkey: pk, share } as any;
  });
}

export function creatorsShareSumOk(creators: { share: number }[]) {
  const sum = creators.reduce((a, b) => a + Number(b.share), 0);
  return sum === 10000;
}

export function workPda(programId: PublicKey, authority: PublicKey, workId: number[]) {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("work"), authority.toBuffer(), Buffer.from(Uint8Array.from(workId))],
    programId
  );
  return pda;
}
