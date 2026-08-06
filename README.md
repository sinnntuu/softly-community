# Softly — social blogging platform

A portfolio-ready social publishing app with Google login, public blog posts,
comments, likes, bookmarks, rich profiles, smart discovery, follow requests,
notifications, connections, and private real-time chat.

## Current features

- Google sign-in with Firebase Authentication
- Create and read public blog posts
- Simple community blogging with seven optional story topics and guided writing templates
- Private 10-star meaningfulness guidance using topic relevance, depth,
  reflection, specificity, and usefulness—not likes or popularity
- Optional school and college challenge rooms with participant-selected themes,
  picture-led entries, durable room history, organizer participation records,
  host-only close/delete controls, ranked winners, and downloadable results
- Add a compressed story photo without paid storage
- Share YouTube, Vimeo, Google Drive, MP4, WebM, or OGG videos
- Real-time likes
- Story comments, sharing, personal bookmarks, and offline story downloads with photos
- Latest, trending and saved feed filters with search suggestions
- Owner-only story deletion with like cleanup
- Editable display name, unique `@username`, bio, location, website, and profile photo
- Find people by username or display name
- Follow requests, connections, and private real-time chat
- Always-visible floating chat shortcut that opens the latest conversation
- Notifications for follows, likes, comments, messages and call invitations
- Instagram-style chat sharing for secure links, compressed photos and videos
- Audio and video-call invitations inside private chat using Jitsi Meet
- Clearly accessible logout and a complete responsive footer
- Re-authenticated account deletion with related-data cleanup
- Responsive neomorphic design with system-aware dark mode, reduced-motion support,
  polished loading/empty/error states, and a consistent Lucide icon system
- Accessible keyboard navigation, focus management, semantic landmarks, and touch targets
- SEO metadata, Open Graph previews, structured data, sitemap, robots file, and web manifest
- Critical-render loading shell, vendor code splitting, image lazy loading, and production caching
- Achievement badges derived from each writer's real community activity
- Strict Firestore document validation that protects profiles, posts, interactions,
  connections, private messages, event rooms, submissions, and reserved usernames

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
authorization rules, private messaging, and video-call invitations.
