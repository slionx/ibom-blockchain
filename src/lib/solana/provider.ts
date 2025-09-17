import { Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";
import { AnchorProvider, Idl, Program } from "@coral-xyz/anchor";

export function makeConnection() {
  const rpc = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || clusterApiUrl("devnet");
  const commitment = (process.env.NEXT_PUBLIC_SOLANA_COMMITMENT as any) || "confirmed";
  return new Connection(rpc, commitment);
}

export function makeProvider(wallet: any) {
  const connection = makeConnection();
  return new AnchorProvider(connection, wallet, {
    commitment: (process.env.NEXT_PUBLIC_SOLANA_COMMITMENT as any) || "confirmed",
  });
}

export function makeProgram(idl: Idl, wallet: any) {
  const provider = makeProvider(wallet);
  const programIdStr = process.env.NEXT_PUBLIC_REGISTRY_PROGRAM_ID || process.env.NEXT_PUBLIC_IBOM_PROGRAM_ID;
  if (!programIdStr) throw new Error("Missing NEXT_PUBLIC_REGISTRY_PROGRAM_ID/NEXT_PUBLIC_IBOM_PROGRAM_ID");
  const programId = new PublicKey(programIdStr);
  const idlWithAddr: any = { ...(idl as any), address: programId.toBase58() };
  return new Program(idlWithAddr as Idl, provider);
}
