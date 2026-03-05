import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const EVO_URL = process.env.EVOLUTION_API_URL;
const EVO_KEY = process.env.EVOLUTION_API_KEY;
const INSTANCE = "Van360";

async function test() {
    console.log(`Testing Evolution API at: ${EVO_URL}`);
    try {
        const url = `${EVO_URL}/instance/connectionState/${INSTANCE}`;
        const response = await axios.get(url, {
            headers: { 'apikey': EVO_KEY }
        });
        console.log(`Status for ${INSTANCE}:`, JSON.stringify(response.data, null, 2));
        
        if (response.data.instance?.state === "open" || response.data.instance?.state === "connected") {
            console.log('Instance is READY. Attempting to send text...');
            const sendUrl = `${EVO_URL}/message/sendText/${INSTANCE}`;
            const sendRes = await axios.post(sendUrl, {
                number: "5511951186951",
                text: "Teste de conexão local Van360 - Check Direto"
            }, {
                headers: {
                    "apikey": EVO_KEY,
                    "Content-Type": "application/json"
                }
            });
            console.log('Send Result:', JSON.stringify(sendRes.data, null, 2));
        } else {
            console.warn('Instance is NOT ready:', response.data.instance?.state);
        }
    } catch (error) {
        console.error('Error:', error.message);
        if (error.response) {
            console.error('Response Status:', error.response.status);
            console.error('Response Data:', JSON.stringify(error.response.data, null, 2));
        }
    }
}

test();
