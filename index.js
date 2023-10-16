import url from 'url';
import { google } from 'googleapis';
import express from 'express';

const PORT = process.env.NODE_PORT;
const app = express();

const oAuth2Client = new google.auth.OAuth2(
	process.env.GOOGLE_CLIENT_ID,
	process.env.GOOGLE_CLIENT_SECRET,
	process.env.GOOGLE_REDIRECT_URI
);

app.get('/', (req, res) => {
	const url = oAuth2Client.generateAuthUrl({
		access_type: 'offline',
		scope: process.env.GOOGLE_SCOPE,
	});
	res.json({ url });
});

app.get('/get-token', async (req, res, next) => {
	try {
		const { code } = url.parse(req.url, true).query;
		const { tokens } = await oAuth2Client.getToken(code);
		if (tokens.refresh_token) {
			oAuth2Client.setCredentials({ refresh_token: tokens.refresh_token });
			await oAuth2Client.refreshAccessToken();
		}
		res.json({ token: tokens.access_token });
	} catch (error) {
		next(error);
	}
});

app.use((req, res, next) => {
	const token = req.headers?.authorization?.split(' ')[1];
	if (!token) {
		return next(new Error('Please provide a token to access this resource'));
	}
	req.token = token;
	next();
});

// using fit store
app.get('/steps', async (req, res, next) => {
	try {
		oAuth2Client.setCredentials({ access_token: req.token });
		const fitnessStore = google.fitness({ version: 'v1', auth: oAuth2Client });
		const dataTypeName = 'com.google.step_count.delta';
		const dataSourceId = 'derived:com.google.step_count.delta:com.google.android.gms:estimated_steps';
		const data = {
			aggregateBy: [{ dataTypeName, dataSourceId }],
			bucketByTime: { durationMillis: 24 * 60 * 60 * 1000 },
			startTimeMillis: Date.now() - 3 * 24 * 60 * 60 * 1000,
			endTimeMillis: Date.now(),
		};

		const result = await fitnessStore.users.dataset.aggregate({
			userId: 'me',
			requestBody: data,
			fields: 'bucket(dataset(point(value(intVal))))',
		});
		res.json(result);
	} catch (error) {
		next(error);
	}
});

// using fetch
app.get('/steps2', async (req, res, next) => {
	try {
		const dataTypeName = 'com.google.step_count.delta';
		const dataSourceId = 'derived:com.google.step_count.delta:com.google.android.gms:estimated_steps';
		const now = Date.now();
		const data = {
			aggregateBy: [{ dataTypeName, dataSourceId }],
			bucketByTime: { durationMillis: 24 * 60 * 60 * 1000 },
			startTimeMillis: now - 3 * 24 * 60 * 60 * 1000,
			endTimeMillis: now,
		};
		const endpoint =
			'https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate?fields=bucket(dataset(point(value(intVal))))';
		const response = await fetch(endpoint, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${req.token}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(data),
		});
		const result = await response.json();
		res.json(result);
	} catch (error) {
		next(error);
	}
});

// error handler middleware
app.use((err, req, res, next) => {
	res.status(500).json({ error: err.message });
});

app.listen(PORT, () => {
	console.log(`App listening at ${PORT}`);
});
