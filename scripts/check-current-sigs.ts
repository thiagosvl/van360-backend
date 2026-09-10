import fs from 'fs';
import { supabaseAdmin } from '../src/config/supabase.js';

async function main() {
  const { data, error } = await supabaseAdmin
    .from('usuarios')
    .select('id, nome, assinatura_digital_url')
    .in('id', [
      'f2dbd620-98ee-4168-894e-ac28eae3ce8b',
      'bb8204b9-12da-4b61-afc4-a1e7eae1bb47'
    ]);

  if (error) throw error;

  for (const u of data) {
    if (u.assinatura_digital_url) {
      const parts = u.assinatura_digital_url.split(',');
      const buf = Buffer.from(parts[1], 'base64');
      const filename = `C:/Users/thiag/.gemini/antigravity/brain/b892a2df-fb4f-4c4f-a09a-18ccb46bb4f8/current_${u.id.substring(0, 8)}.png`;
      fs.writeFileSync(filename, buf);
      const width = buf.readUInt32BE(16);
      const height = buf.readUInt32BE(20);
      console.log(`User: ${u.nome} (${u.id}) -> Dimensions: ${width}x${height}, b64 len: ${u.assinatura_digital_url.length}`);
    } else {
      console.log(`User: ${u.nome} (${u.id}) has NO signature!`);
    }
  }
}

main().catch(console.error);
