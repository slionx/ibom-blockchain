import { Keypair } from '@solana/web3.js';
import fs from 'node:fs';

const kp = Keypair.generate();
const json = Array.from(kp.secretKey);
const base64 = Buffer.from(kp.secretKey).toString('base64');

const outFile = process.argv[2];
if (outFile) {
  fs.writeFileSync(outFile, JSON.stringify(json));
}

console.log('Public Key:', kp.publicKey.toBase58());
console.log('JSON Secret:', JSON.stringify(json));
console.log('BASE64 Secret:', base64);

