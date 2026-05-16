import express from 'express';
import { POST, GET } from './app/api/onboarding/company/route.js';

const app = express();
app.use(express.json());

app.post('/api/onboarding/company', async (req, res) => {
  const response = await POST({ json: async () => req.body });
  const data = await response.json();
  res.status(response.status).send(data);
});

app.get('/api/onboarding/company', async (req, res) => {
  const response = await GET();
  const data = await response.json();
  res.status(response.status).send(data);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
