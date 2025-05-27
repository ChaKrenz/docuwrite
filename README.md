# DocuWrite - AI-Powered Document Editor

A modern web-based document editor with AI assistance, speech-to-text dictation, and real-time collaboration features.

## Features

- Rich text editing with formatting options
- AI-powered writing assistance
- Speech-to-text dictation
- Real-time document saving
- Document export (TXT, PDF)
- Responsive design
- Dark mode interface

## Tech Stack

- Frontend: HTML5, CSS3, JavaScript
- Backend: Node.js, Express
- AI: Google Gemini API
- Hosting: Firebase Hosting
- Database: Firebase Firestore

## Setup

1. Clone the repository:
```bash
git clone https://github.com/ChaKrenz/docuwrite.git
cd docuwrite
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
   - Copy `.env.example` to `.env`
   - Fill in your Firebase configuration values
   - Add your Gemini API key

Required environment variables:
```
# Firebase Configuration
FIREBASE_API_KEY=your_firebase_api_key
FIREBASE_AUTH_DOMAIN=your_firebase_auth_domain
FIREBASE_PROJECT_ID=your_firebase_project_id
FIREBASE_STORAGE_BUCKET=your_firebase_storage_bucket
FIREBASE_MESSAGING_SENDER_ID=your_firebase_messaging_sender_id
FIREBASE_APP_ID=your_firebase_app_id
FIREBASE_MEASUREMENT_ID=your_firebase_measurement_id

# Gemini API Configuration
GEMINI_API_KEY=your_gemini_api_key
```

4. Start the development server:
```bash
npm start
```

## Deployment

The application is configured for Firebase hosting. To deploy:

```bash
firebase deploy
```

## License

MIT License

## Author

Chance Krenzer (ChaKrenz) 