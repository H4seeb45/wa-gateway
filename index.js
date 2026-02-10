const express = require('express');
const cors = require('cors');
const { initWhatsApp, sendFeeAlert, getStatus } = require('./wa-gateway');
const QRCode = require('qrcode');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Premium Dashboard HTML
const dashboardHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Zafeen Lyceum | WA Gateway</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --glass: rgba(255, 255, 255, 0.1);
            --glass-border: rgba(255, 255, 255, 0.2);
            --primary: #6366f1;
            --primary-glow: rgba(99, 102, 241, 0.5);
            --bg: #0f172a;
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            font-family: 'Outfit', sans-serif;
        }

        body {
            background: var(--bg);
            color: white;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 40px 20px;
            background: radial-gradient(circle at top right, #1e1b4b, #0f172a);
        }

        .container {
            width: 100%;
            max-width: 800px;
        }

        .header {
            text-align: center;
            margin-bottom: 50px;
        }

        .header h1 {
            font-size: 3rem;
            font-weight: 700;
            background: linear-gradient(to right, #818cf8, #c084fc);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin-bottom: 10px;
        }

        .header p {
            color: #94a3b8;
            font-size: 1.1rem;
        }

        .card {
            background: var(--glass);
            backdrop-filter: blur(12px);
            border: 1px solid var(--glass-border);
            border-radius: 24px;
            padding: 40px;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
            transition: transform 0.3s ease;
        }

        .form-group {
            margin-bottom: 25px;
        }

        label {
            display: block;
            margin-bottom: 10px;
            color: #cbd5e1;
            font-weight: 500;
        }

        input {
            width: 100%;
            background: rgba(0, 0, 0, 0.3);
            border: 1px solid var(--glass-border);
            border-radius: 12px;
            padding: 14px 20px;
            color: white;
            font-size: 1rem;
            transition: all 0.3s ease;
        }

        input:focus {
            outline: none;
            border-color: var(--primary);
            box-shadow: 0 0 0 4px var(--primary-glow);
        }

        button {
            width: 100%;
            background: var(--primary);
            color: white;
            border: none;
            border-radius: 12px;
            padding: 16px;
            font-size: 1.1rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            box-shadow: 0 10px 15px -3px var(--primary-glow);
        }

        button:hover {
            transform: translateY(-2px);
            filter: brightness(1.1);
        }

        .status-area {
            margin-top: 40px;
            display: none;
            text-align: center;
        }

        .status-badge {
            display: inline-block;
            padding: 6px 16px;
            border-radius: 99px;
            font-size: 0.9rem;
            font-weight: 600;
            margin-bottom: 20px;
        }

        .status-online { background: #059669; color: #ecfdf5; }
        .status-offline { background: #dc2626; color: #fef2f2; }
        .status-pending { background: #d97706; color: #fffbeb; }

        .qr-container {
            background: white;
            padding: 20px;
            border-radius: 16px;
            display: inline-block;
            margin-top: 20px;
        }

        #qrImage {
            max-width: 250px;
        }

        .toast {
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: #1e293b;
            border: 1px solid var(--glass-border);
            padding: 16px 24px;
            border-radius: 12px;
            color: white;
            display: none;
            animation: slideUp 0.3s ease;
        }

        @keyframes slideUp {
            from { transform: translateY(100%); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Zafeen Lyceum</h1>
            <p>WhatsApp API Gateway Dashboard</p>
        </div>

        <div class="card">
            <div class="form-group">
                <label for="schoolId">School ID (Tenant)</label>
                <input type="text" id="schoolId" placeholder="e.g. school_001">
            </div>
            <button onclick="checkStatus()">Connect / Check Status</button>

            <div id="statusArea" class="status-area">
                <div id="statusBadge" class="status-badge">Checking...</div>
                <div id="qrSection" style="display:none">
                    <p style="color: #94a3b8; margin-bottom: 20px;">Scan this QR code with WhatsApp to connect</p>
                    <div class="qr-container">
                        <img id="qrImage" src="" alt="QR Code">
                    </div>
                </div>
                <div id="onlineSection" style="display:none">
                    <p style="color: #10b981; font-size: 1.2rem; font-weight: 600;">System is LIVE</p>
                    <p style="color: #94a3b8; margin-top: 10px;">Ready to send fee alerts.</p>
                </div>
            </div>
        </div>
    </div>

    <div id="toast" class="toast"></div>

    <script>
        async function checkStatus() {
            const schoolId = document.getElementById('schoolId').value;
            if (!schoolId) {
                showToast("Please enter a School ID");
                return;
            }

            const statusArea = document.getElementById('statusArea');
            const statusBadge = document.getElementById('statusBadge');
            const qrSection = document.getElementById('qrSection');
            const onlineSection = document.getElementById('onlineSection');
            const qrImage = document.getElementById('qrImage');

            statusArea.style.display = 'block';
            statusBadge.className = 'status-badge status-pending';
            statusBadge.innerText = 'Initializing...';
            qrSection.style.display = 'none';
            onlineSection.style.display = 'none';

            try {
                // First attempt to init (or get existing)
                await fetch('/api/init', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ schoolId })
                });

                // Start polling status
                const poll = setInterval(async () => {
                    const res = await fetch(\`/api/status/\${schoolId}\`);
                    const data = await res.json();

                    if (data.isReady) {
                        statusBadge.className = 'status-badge status-online';
                        statusBadge.innerText = 'ONLINE';
                        qrSection.style.display = 'none';
                        onlineSection.style.display = 'block';
                        clearInterval(poll);
                    } else if (data.qrCode) {
                        statusBadge.className = 'status-badge status-pending';
                        statusBadge.innerText = 'AWAITING SCAN';
                        qrSection.style.display = 'block';
                        qrImage.src = data.qrCode;
                    } else {
                        statusBadge.className = 'status-badge status-pending';
                        statusBadge.innerText = 'INITIALIZING PULSE...';
                    }
                }, 3000);

            } catch (err) {
                showToast("Error: " + err.message);
            }
        }

        function showToast(msg) {
            const toast = document.getElementById('toast');
            toast.innerText = msg;
            toast.style.display = 'block';
            setTimeout(() => { toast.style.display = 'none'; }, 3000);
        }
    </script>
</body>
</html>
`;

// Routes
app.get('/', (req, res) => {
    res.send(dashboardHTML);
});

// Initialize WhatsApp for a school
app.post('/api/init', (req, res) => {
    const { schoolId } = req.body;
    try {
        initWhatsApp(schoolId);
        res.json({ success: true, message: `Initialization started for ${schoolId}` });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

// Get status of a school link
app.get('/api/status/:schoolId', async (req, res) => {
    const { schoolId } = req.params;
    const status = getStatus(schoolId);
    
    // Convert text QR to image if exists
    let qrDataUri = null;
    if (status.qrCode) {
        try {
            qrDataUri = await QRCode.toDataURL(status.qrCode);
        } catch (err) {
            console.error('QR Gen Error:', err);
        }
    }

    res.json({
        ...status,
        qrCode: qrDataUri // Send as DataURI for easy frontend display
    });
});

// Send Fee Alert
app.post('/api/send', async (req, res) => {
    const { schoolId, phoneNumber, studentName, amount, dueDate } = req.body;
    
    if (!schoolId || !phoneNumber || !studentName || !amount || !dueDate) {
        return res.status(400).json({ success: false, error: "Missing required fields" });
    }

    try {
        const result = await sendFeeAlert(schoolId, phoneNumber, studentName, amount, dueDate);
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`\n[Zafeen Lyceum] Gateway running at http://localhost:${PORT}`);
    console.log(`[Zafeen Lyceum] Environment: Multi-Tenant Singleton ready.\n`);
});
