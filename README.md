# Softly — social blogging platform

A portfolio-ready social publishing app with Google login, public blog posts,
likes, editable profiles, unique usernames, profile photos, people search,
follow requests, connections, and private real-time chat.

## Current features

- Google sign-in with Firebase Authentication
- Create and read public blog posts
- Real-time likes
- Owner-only story deletion with like cleanup
- Editable display name, unique `@username`, bio, and compressed profile photo
- Find people by username or display name
- Follow requests, connections, and private real-time chat
- Re-authenticated account deletion with related-data cleanup
- Responsive neomorphic design
- Firestore rules that protect profiles and reserve usernames atomically

## Free Firebase setup

1. Create a free project at https://console.firebase.google.com.
2. Add a Web App in **Project settings → Your apps**.
3. Copy `.env.example` to `.env` and paste the six Firebase web config values.
4. Open **Authentication → Sign-in method**, enable **Google**, and save.
5. Open **Firestore Database**, create a database in production mode.
6. Copy `.firebaserc.example` to `.firebaserc` and replace the project ID.

## Run in VS Code

```bash
npm install
npm run dev
```

## Deploy for free

```bash
npx firebase-tools login
npm run deploy
```

The deploy command publishes the app, Firestore rules, and required
configuration. Firebase provides free `web.app` and `firebaseapp.com` URLs.

## Put it on GitHub

Create an empty GitHub repository, then run:

```bash
git init
git add .
git commit -m "Build Softly social blogging platform"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git
git push -u origin main
```

Never commit `.env`; it is already ignored. Firebase web configuration is
designed to be public, but keeping environments separate is still good practice.

## Resume description

**Softly — Social Blogging Platform**  
Built a responsive React and Firebase community platform with Google OAuth,
real-time Firestore data, publishing, likes, follow requests, secure
authorization rules, and private messaging.
