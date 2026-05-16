import express from 'express';
import { POST, GET } from './app/api/onboarding/company/route.js';

const app = express();
app.use(express.json());

app.post('/api/onboarding/company', async (req, res) => {
  try {
    const request = new Request(`http://localhost:${process.env.PORT || 3000}/api/onboarding/company`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });

    const response = await POST(request);
    const data = await response.json();
    res.status(response.status).send(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/onboarding/company', async (req, res) => {
  try {
    const request = new Request(`http://localhost:${process.env.PORT || 3000}/api/onboarding/company`, {
      method: 'GET'
    });

    const response = await GET(request);
    const data = await response.json();
    res.status(response.status).send(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
