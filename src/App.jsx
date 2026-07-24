import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import {
  deleteUser,
  getRedirectResult,
  onAuthStateChanged,
  reauthenticateWithPopup,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from "firebase/auth";
import {
  auth,
  db,
  firebaseReady,
  googleProvider,
} from "./firebase";

const categories = ["All stories", "Design", "Culture", "Technology", "Life"];
const tones = ["peach", "sage", "sky"];

const initials = (name = "Softly writer") =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

const timeValue = (value) => value?.toMillis?.() ?? 0;
const chatId = (a, b) => [a, b].sort().join("_");
const callURL = (room) =>
  `https://meet.jit.si/${encodeURIComponent(room)}`;
const createCallRoom = () => {
  if (globalThis.crypto?.getRandomValues) {
    const values = new Uint32Array(4);
    globalThis.crypto.getRandomValues(values);
    return `Softly-${Array.from(values, (value) =>
      value.toString(36),
    ).join("-")}`;
  }
  return `Softly-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 14)}`;
};
const usernamePattern = /^[a-z0-9_]{3,20}$/;

const profileName = (profile, user) =>
  profile?.displayName || user?.displayName || "Softly writer";

function ProfileAvatar({ person, tone = "sage", large = false }) {
  const photoURL = person?.photoURL?.trim?.();
  const name = person?.displayName || "Softly writer";

  return (
    <span
      className={`avatar ${tone} ${large ? "avatarLarge" : ""} ${
        photoURL ? "hasPhoto" : ""
      }`}
      aria-hidden="true"
    >
      {photoURL ? (
        <img src={photoURL} alt="" referrerPolicy="no-referrer" />
      ) : (
        initials(name)
      )}
    </span>
  );
}

const resizeProfilePhoto = (file) =>
  new Promise((resolve, reject) => {
    if (!file?.type?.startsWith("image/")) {
      reject(new Error("Please choose an image file."));
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      reject(new Error("Please choose an image smaller than 8 MB."));
      return;
    }

    const image = new Image();
    const objectURL = URL.createObjectURL(file);
    image.onload = () => {
      const size = Math.min(image.naturalWidth, image.naturalHeight);
      const sourceX = (image.naturalWidth - size) / 2;
      const sourceY = (image.naturalHeight - size) / 2;
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 256;
      const context = canvas.getContext("2d");
      context.drawImage(image, sourceX, sourceY, size, size, 0, 0, 256, 256);
      const dataURL = canvas.toDataURL("image/jpeg", 0.78);
      URL.revokeObjectURL(objectURL);
      if (dataURL.length > 180000) {
        reject(new Error("This photo is still too large. Try another image."));
        return;
      }
      resolve(dataURL);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectURL);
      reject(new Error("That image could not be opened."));
    };
    image.src = objectURL;
  });

const compressStoryPhoto = (file) =>
  new Promise((resolve, reject) => {
    if (!file?.type?.startsWith("image/")) {
      reject(new Error("Please choose an image file."));
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      reject(new Error("Please choose an image smaller than 15 MB."));
      return;
    }

    const image = new Image();
    const objectURL = URL.createObjectURL(file);
    image.onload = () => {
      let scale = Math.min(
        1,
        1280 / Math.max(image.naturalWidth, image.naturalHeight),
      );
      let quality = 0.8;
      let dataURL = "";

      for (let attempt = 0; attempt < 10; attempt += 1) {
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext("2d");
        context.fillStyle = "#e9e7df";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        dataURL = canvas.toDataURL("image/jpeg", quality);
        if (dataURL.length <= 480000) break;
        if (quality > 0.56) {
          quality -= 0.08;
        } else {
          scale *= 0.82;
        }
      }

      URL.revokeObjectURL(objectURL);
      if (!dataURL || dataURL.length > 480000) {
        reject(new Error("This photo could not be compressed enough."));
        return;
      }
      resolve(dataURL);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectURL);
      reject(new Error("That image could not be opened."));
    };
    image.src = objectURL;
  });

const getVideoDetails = (value = "") => {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:") return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    let videoId = "";

    if (host === "youtu.be") {
      videoId = url.pathname.split("/").filter(Boolean)[0] || "";
    } else if (
      host === "youtube.com" ||
      host === "m.youtube.com" ||
      host === "youtube-nocookie.com"
    ) {
      videoId =
        url.searchParams.get("v") ||
        url.pathname.match(/^\/(?:shorts|embed)\/([^/?]+)/)?.[1] ||
        "";
    }

    if (/^[a-zA-Z0-9_-]{6,20}$/.test(videoId)) {
      return {
        kind: "embed",
        provider: "YouTube",
        src: `https://www.youtube-nocookie.com/embed/${videoId}`,
        thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      };
    }

    if (host === "vimeo.com" || host === "player.vimeo.com") {
      const vimeoId = url.pathname.match(/(?:video\/)?(\d{6,12})/)?.[1];
      if (vimeoId) {
        return {
          kind: "embed",
          provider: "Vimeo",
          src: `https://player.vimeo.com/video/${vimeoId}`,
          thumbnail: "",
        };
      }
    }

    if (host === "drive.google.com") {
      const driveId = url.pathname.match(/\/file\/d\/([^/]+)/)?.[1];
      if (driveId) {
        return {
          kind: "embed",
          provider: "Google Drive",
          src: `https://drive.google.com/file/d/${driveId}/preview`,
          thumbnail: "",
        };
      }
    }

    if (/\.(mp4|webm|ogg)$/i.test(url.pathname)) {
      return {
        kind: "direct",
        provider: "Video",
        src: url.toString(),
        thumbnail: "",
      };
    }
  } catch {
    return null;
  }

  return null;
};

function StoryVideo({ details, title }) {
  if (!details) return null;
  if (details.kind === "direct") {
    return (
      <video className="storyVideo" controls preload="metadata">
        <source src={details.src} />
        Your browser does not support this video.
      </video>
    );
  }

  return (
    <div className="storyVideoFrame">
      <iframe
        src={details.src}
        title={`${title} — ${details.provider} video`}
        loading="lazy"
        allow="accelerometer; autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
      />
    </div>
  );
}

const deleteRefsInChunks = async (database, refs) => {
  const uniqueRefs = [
    ...new Map(refs.map((item) => [item.path, item])).values(),
  ];

  for (let index = 0; index < uniqueRefs.length; index += 450) {
    const batch = writeBatch(database);
    uniqueRefs.slice(index, index + 450).forEach((item) => batch.delete(item));
    await batch.commit();
  }
};

export default function App() {
  const previewName = import.meta.env.DEV
    ? new URLSearchParams(window.location.search).get("preview")
    : "";
  const mediaPreviewMode = previewName === "media";
  const callPreviewMode = previewName === "call";
  const localPreviewMode = mediaPreviewMode || callPreviewMode;
  const previewConnection = callPreviewMode
    ? {
        uid: "local-call-friend",
        displayName: "Aarav Sharma",
        username: "aarav_writes",
        photoURL: "",
      }
    : null;
  const previewUser = localPreviewMode
    ? {
        uid: "local-feature-preview",
        displayName: "Preview Writer",
        email: "preview@example.com",
        photoURL: "",
      }
    : null;
  const [user, setUser] = useState(previewUser);
  const [profile, setProfile] = useState(
    previewUser
      ? {
          uid: previewUser.uid,
          displayName: previewUser.displayName,
          username: "preview_writer",
          usernameLower: "preview_writer",
          bio: "Local feature preview",
          photoURL: "",
        }
      : null,
  );
  const [authLoading, setAuthLoading] = useState(true);
  const [posts, setPosts] = useState([]);
  const [likes, setLikes] = useState([]);
  const [people, setPeople] = useState(
    previewConnection ? [previewConnection] : [],
  );
  const [outgoing, setOutgoing] = useState(
    previewConnection
      ? [
          {
            id: "preview-connection",
            from: previewUser.uid,
            to: previewConnection.uid,
            status: "accepted",
          },
        ]
      : [],
  );
  const [incoming, setIncoming] = useState([]);
  const [messages, setMessages] = useState(
    callPreviewMode
      ? [
          {
            id: "preview-text",
            senderId: previewConnection.uid,
            receiverId: previewUser.uid,
            messageType: "text",
            text: "Want to discuss your latest story?",
          },
        ]
      : [],
  );
  const [category, setCategory] = useState("All stories");
  const [search, setSearch] = useState("");
  const [composerOpen, setComposerOpen] = useState(false);
  const [socialOpen, setSocialOpen] = useState(callPreviewMode);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [mediaPreparing, setMediaPreparing] = useState(false);
  const [storyPublishing, setStoryPublishing] = useState(false);
  const [callStarting, setCallStarting] = useState(false);
  const [postToDelete, setPostToDelete] = useState(null);
  const [postDeleting, setPostDeleting] = useState(false);
  const [accountDeleteOpen, setAccountDeleteOpen] = useState(false);
  const [accountDeleteText, setAccountDeleteText] = useState("");
  const [accountDeleting, setAccountDeleting] = useState(false);
  const [peopleSearch, setPeopleSearch] = useState("");
  const [activeChat, setActiveChat] = useState(previewConnection);
  const [message, setMessage] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [notice, setNotice] = useState("");
  const [draft, setDraft] = useState({
    title: "",
    excerpt: "",
    body: "",
    category: "Life",
    mediaType: "",
    mediaURL: "",
  });
  const [profileDraft, setProfileDraft] = useState({
    displayName: "",
    username: "",
    bio: "",
    photoURL: "",
  });

  useEffect(() => {
    if (localPreviewMode) {
      setAuthLoading(false);
      return;
    }
    if (!firebaseReady || !auth) {
      setAuthLoading(false);
      return;
    }
    getRedirectResult(auth).catch(() => {});
    return onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      setAuthLoading(false);
      if (nextUser && db) {
        const userRef = doc(db, "users", nextUser.uid);
        const existing = await getDoc(userRef);
        if (existing.exists()) {
          await setDoc(
            userRef,
            {
              email: nextUser.email || "",
              lastSeenAt: serverTimestamp(),
            },
            { merge: true },
          );
        } else {
          await setDoc(userRef, {
            displayName: nextUser.displayName || "Softly writer",
            email: nextUser.email || "",
            photoURL: nextUser.photoURL || "",
            bio: "",
            joinedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      }
    });
  }, []);

  useEffect(() => {
    if (localPreviewMode) return;
    if (!user || !db) {
      setProfile(null);
      return;
    }
    return onSnapshot(doc(db, "users", user.uid), (snapshot) => {
      setProfile(
        snapshot.exists()
          ? { uid: snapshot.id, ...snapshot.data() }
          : null,
      );
    });
  }, [user]);

  useEffect(() => {
    if (!firebaseReady || !db) return;
    const postQuery = query(
      collection(db, "posts"),
      orderBy("createdAt", "desc"),
      limit(60),
    );
    const stopPosts = onSnapshot(postQuery, (snapshot) => {
      setPosts(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
    });
    const stopLikes = onSnapshot(collection(db, "likes"), (snapshot) => {
      setLikes(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
    });
    return () => {
      stopPosts();
      stopLikes();
    };
  }, []);

  useEffect(() => {
    if (localPreviewMode) return;
    if (!user || !db) {
      setPeople([]);
      setOutgoing([]);
      setIncoming([]);
      return;
    }

    const stopUsers = onSnapshot(collection(db, "users"), (snapshot) => {
      setPeople(
        snapshot.docs
          .filter((item) => item.id !== user.uid)
          .map((item) => ({ uid: item.id, ...item.data() })),
      );
    });
    const stopOutgoing = onSnapshot(
      query(collection(db, "follows"), where("from", "==", user.uid)),
      (snapshot) =>
        setOutgoing(
          snapshot.docs.map((item) => ({ id: item.id, ...item.data() })),
        ),
    );
    const stopIncoming = onSnapshot(
      query(collection(db, "follows"), where("to", "==", user.uid)),
      (snapshot) =>
        setIncoming(
          snapshot.docs.map((item) => ({ id: item.id, ...item.data() })),
        ),
    );

    return () => {
      stopUsers();
      stopOutgoing();
      stopIncoming();
    };
  }, [user]);

  useEffect(() => {
    if (callPreviewMode) return;
    if (!user || !activeChat || !db) {
      setMessages([]);
      return;
    }
    return onSnapshot(
      query(
        collection(db, "messages"),
        where("chatId", "==", chatId(user.uid, activeChat.uid)),
        where("participants", "array-contains", user.uid),
        limit(100),
      ),
      (snapshot) => {
        setMessages(
          snapshot.docs
            .map((item) => ({ id: item.id, ...item.data() }))
            .sort((a, b) => timeValue(a.createdAt) - timeValue(b.createdAt)),
        );
      },
    );
  }, [user, activeChat]);

  const likesByPost = useMemo(() => {
    const result = {};
    for (const like of likes) {
      result[like.postId] ??= [];
      result[like.postId].push(like.userId);
    }
    return result;
  }, [likes]);

  const visiblePosts = useMemo(() => {
    const term = search.trim().toLowerCase();
    return posts.filter((post) => {
      const categoryMatch =
        category === "All stories" || post.category === category;
      const searchMatch =
        !term ||
        `${post.title} ${post.excerpt} ${post.authorName}`
          .toLowerCase()
          .includes(term);
      return categoryMatch && searchMatch;
    });
  }, [posts, search, category]);

  const connections = useMemo(() => {
    const ids = new Set([
      ...outgoing
        .filter((item) => item.status === "accepted")
        .map((item) => item.to),
      ...incoming
        .filter((item) => item.status === "accepted")
        .map((item) => item.from),
    ]);
    return people.filter((person) => ids.has(person.uid));
  }, [people, outgoing, incoming]);

  const filteredPeople = useMemo(() => {
    const term = peopleSearch.trim().toLowerCase().replace(/^@/, "");
    if (!term) return people;
    return people.filter((person) =>
      `${person.username || ""} ${person.displayName || ""}`
        .toLowerCase()
        .includes(term),
    );
  }, [people, peopleSearch]);

  const incomingRequests = incoming.filter(
    (item) => item.status === "pending",
  );
  const currentName = profileName(profile, user);
  const currentPhoto =
    profile?.photoURL || user?.photoURL || "";
  const draftVideoDetails = useMemo(
    () =>
      draft.mediaType === "video"
        ? getVideoDetails(draft.mediaURL)
        : null,
    [draft.mediaType, draft.mediaURL],
  );

  const login = async () => {
    if (!auth) return;
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      if (
        error?.code === "auth/popup-blocked" ||
        error?.code === "auth/cancelled-popup-request"
      ) {
        await signInWithRedirect(auth, googleProvider);
      } else if (error?.code !== "auth/popup-closed-by-user") {
        setNotice("Google sign-in could not start. Check Firebase setup.");
      }
    }
  };

  const requireUser = (action) => {
    if (!user) {
      login();
      return false;
    }
    action();
    return true;
  };

  const openProfileEditor = () => {
    setSocialOpen(false);
    setActiveChat(null);
    setProfileDraft({
      displayName: currentName,
      username: profile?.username || "",
      bio: profile?.bio || "",
      photoURL: currentPhoto,
    });
    setProfileOpen(true);
  };

  const chooseProfilePhoto = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const photoURL = await resizeProfilePhoto(file);
      setProfileDraft((current) => ({ ...current, photoURL }));
    } catch (error) {
      setNotice(error.message || "The photo could not be prepared.");
    }
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    if (!user || !db || profileSaving) return;

    const displayName = profileDraft.displayName.trim();
    const username = profileDraft.username
      .trim()
      .toLowerCase()
      .replace(/^@/, "");
    const bio = profileDraft.bio.trim();

    if (displayName.length < 2 || displayName.length > 50) {
      setNotice("Display name must be between 2 and 50 characters.");
      return;
    }
    if (!usernamePattern.test(username)) {
      setNotice("Username needs 3–20 lowercase letters, numbers or _ only.");
      return;
    }

    setProfileSaving(true);
    try {
      const userRef = doc(db, "users", user.uid);
      const usernameRef = doc(db, "usernames", username);
      const oldUsername = profile?.usernameLower || "";

      await runTransaction(db, async (transaction) => {
        const usernameSnapshot = await transaction.get(usernameRef);
        if (
          usernameSnapshot.exists() &&
          usernameSnapshot.data().uid !== user.uid
        ) {
          throw new Error("USERNAME_TAKEN");
        }

        if (oldUsername && oldUsername !== username) {
          transaction.delete(doc(db, "usernames", oldUsername));
        }

        transaction.set(
          usernameRef,
          {
            uid: user.uid,
            username,
            createdAt: serverTimestamp(),
          },
          { merge: true },
        );
        transaction.set(
          userRef,
          {
            displayName,
            username,
            usernameLower: username,
            bio: bio.slice(0, 220),
            photoURL: profileDraft.photoURL || "",
            email: user.email || "",
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );
      });

      setProfileOpen(false);
      setNotice("Profile updated.");
      window.setTimeout(() => setNotice(""), 3500);
    } catch (error) {
      setNotice(
        error.message === "USERNAME_TAKEN"
          ? "That username is already taken. Try another one."
          : "Profile could not be saved. Please try again.",
      );
    } finally {
      setProfileSaving(false);
    }
  };

  const chooseStoryPhoto = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setMediaPreparing(true);
    try {
      const mediaURL = await compressStoryPhoto(file);
      setDraft((current) => ({
        ...current,
        mediaType: "image",
        mediaURL,
      }));
      setNotice("Photo ready.");
      window.setTimeout(() => setNotice(""), 2200);
    } catch (error) {
      setNotice(error.message || "The story photo could not be prepared.");
    } finally {
      setMediaPreparing(false);
    }
  };

  const publish = async (event) => {
    event.preventDefault();
    if (mediaPreviewMode) {
      setNotice("Local preview only — nothing was published.");
      return;
    }
    if (!user || !db || storyPublishing || mediaPreparing) return;

    if (
      draft.mediaType === "video" &&
      !getVideoDetails(draft.mediaURL)
    ) {
      setNotice(
        "Use a public YouTube, Vimeo, Google Drive, MP4, WebM or OGG link.",
      );
      return;
    }

    setStoryPublishing(true);
    try {
      const story = {
        title: draft.title,
        excerpt: draft.excerpt,
        body: draft.body,
        category: draft.category,
        authorId: user.uid,
        authorName: currentName,
        authorPhoto: currentPhoto,
        createdAt: serverTimestamp(),
      };
      if (draft.mediaType && draft.mediaURL) {
        story.mediaType = draft.mediaType;
        story.mediaURL = draft.mediaURL;
      }

      await addDoc(collection(db, "posts"), story);
      setDraft({
        title: "",
        excerpt: "",
        body: "",
        category: "Life",
        mediaType: "",
        mediaURL: "",
      });
      setComposerOpen(false);
      setNotice("Your story is live.");
      window.setTimeout(() => setNotice(""), 3500);
    } catch {
      setNotice("Your story could not be published. Please try again.");
    } finally {
      setStoryPublishing(false);
    }
  };

  const toggleLike = async (postId) => {
    if (!user || !db) {
      login();
      return;
    }
    const id = `${postId}_${user.uid}`;
    const liked = likes.some((item) => item.id === id);
    if (liked) {
      await deleteDoc(doc(db, "likes", id));
    } else {
      await setDoc(doc(db, "likes", id), {
        postId,
        userId: user.uid,
        createdAt: serverTimestamp(),
      });
    }
  };

  const deletePost = async () => {
    if (
      !postToDelete ||
      !user ||
      !db ||
      postToDelete.authorId !== user.uid ||
      postDeleting
    ) {
      return;
    }

    setPostDeleting(true);
    try {
      const postLikes = await getDocs(
        query(
          collection(db, "likes"),
          where("postId", "==", postToDelete.id),
        ),
      );
      await deleteRefsInChunks(
        db,
        postLikes.docs.map((item) => item.ref),
      );
      await deleteDoc(doc(db, "posts", postToDelete.id));
      setPostToDelete(null);
      setNotice("Story deleted.");
      window.setTimeout(() => setNotice(""), 3500);
    } catch {
      setNotice("Story could not be deleted. Please try again.");
    } finally {
      setPostDeleting(false);
    }
  };

  const openAccountDelete = () => {
    setProfileOpen(false);
    setAccountDeleteText("");
    setAccountDeleteOpen(true);
  };

  const deleteAccountCompletely = async () => {
    if (
      !user ||
      !auth?.currentUser ||
      !db ||
      accountDeleteText !== "DELETE" ||
      accountDeleting
    ) {
      return;
    }

    setAccountDeleting(true);
    let dataRemoved = false;

    try {
      await reauthenticateWithPopup(auth.currentUser, googleProvider);

      const [
        authoredPosts,
        ownLikes,
        sentFollows,
        receivedFollows,
        accountMessages,
      ] = await Promise.all([
        getDocs(
          query(collection(db, "posts"), where("authorId", "==", user.uid)),
        ),
        getDocs(
          query(collection(db, "likes"), where("userId", "==", user.uid)),
        ),
        getDocs(
          query(collection(db, "follows"), where("from", "==", user.uid)),
        ),
        getDocs(
          query(collection(db, "follows"), where("to", "==", user.uid)),
        ),
        getDocs(
          query(
            collection(db, "messages"),
            where("participants", "array-contains", user.uid),
          ),
        ),
      ]);

      const likesOnAuthoredPosts = await Promise.all(
        authoredPosts.docs.map((postItem) =>
          getDocs(
            query(
              collection(db, "likes"),
              where("postId", "==", postItem.id),
            ),
          ),
        ),
      );

      const relatedRefs = [
        ...ownLikes.docs.map((item) => item.ref),
        ...sentFollows.docs.map((item) => item.ref),
        ...receivedFollows.docs.map((item) => item.ref),
        ...accountMessages.docs.map((item) => item.ref),
        ...likesOnAuthoredPosts.flatMap((snapshot) =>
          snapshot.docs.map((item) => item.ref),
        ),
      ];

      await deleteRefsInChunks(db, relatedRefs);
      await deleteRefsInChunks(
        db,
        authoredPosts.docs.map((item) => item.ref),
      );

      const identityRefs = [doc(db, "users", user.uid)];
      if (profile?.usernameLower) {
        identityRefs.unshift(
          doc(db, "usernames", profile.usernameLower),
        );
      }
      await deleteRefsInChunks(db, identityRefs);
      dataRemoved = true;

      await deleteUser(auth.currentUser);
      setAccountDeleteOpen(false);
      setNotice("");
    } catch (error) {
      if (dataRemoved && auth.currentUser) {
        await setDoc(doc(db, "users", user.uid), {
          displayName: currentName,
          email: user.email || "",
          photoURL: currentPhoto,
          bio: "",
          joinedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      }

      if (
        error?.code === "auth/popup-closed-by-user" ||
        error?.code === "auth/cancelled-popup-request"
      ) {
        setNotice("Account deletion cancelled.");
      } else if (dataRemoved) {
        setNotice(
          "Your content was cleared, but the login account stayed active. Please try Delete account again.",
        );
      } else {
        setNotice("Account could not be deleted. Nothing was removed.");
      }
    } finally {
      setAccountDeleting(false);
    }
  };

  const requestFollow = async (person) => {
    if (!user || !db) return;
    await setDoc(doc(db, "follows", `${user.uid}_${person.uid}`), {
      from: user.uid,
      to: person.uid,
      fromName: currentName,
      toName: person.displayName || "Softly writer",
      status: "pending",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  };

  const answerRequest = async (request, accepted) => {
    if (!db) return;
    if (accepted) {
      await updateDoc(doc(db, "follows", request.id), {
        status: "accepted",
        updatedAt: serverTimestamp(),
      });
    } else {
      await deleteDoc(doc(db, "follows", request.id));
    }
  };

  const removeFollow = async (person) => {
    if (!user || !db) return;
    const outgoingMatch = outgoing.find((item) => item.to === person.uid);
    const incomingMatch = incoming.find((item) => item.from === person.uid);
    if (outgoingMatch) await deleteDoc(doc(db, "follows", outgoingMatch.id));
    if (incomingMatch) await deleteDoc(doc(db, "follows", incomingMatch.id));
    if (activeChat?.uid === person.uid) setActiveChat(null);
  };

  const sendMessage = async (event) => {
    event.preventDefault();
    const text = message.trim();
    if (!text || !user || !activeChat) return;
    if (callPreviewMode) {
      setMessages((current) => [
        ...current,
        {
          id: `preview-message-${Date.now()}`,
          senderId: user.uid,
          receiverId: activeChat.uid,
          messageType: "text",
          text: text.slice(0, 1000),
        },
      ]);
      setMessage("");
      return;
    }
    if (!db) return;
    await addDoc(collection(db, "messages"), {
      chatId: chatId(user.uid, activeChat.uid),
      senderId: user.uid,
      receiverId: activeChat.uid,
      participants: [user.uid, activeChat.uid],
      messageType: "text",
      text: text.slice(0, 1000),
      createdAt: serverTimestamp(),
    });
    setMessage("");
  };

  const startVideoCall = async () => {
    if (!user || !activeChat || callStarting) return;

    const room = createCallRoom();
    const invitation = {
      chatId: chatId(user.uid, activeChat.uid),
      senderId: user.uid,
      receiverId: activeChat.uid,
      participants: [user.uid, activeChat.uid],
      messageType: "video_call",
      text: `${currentName} started a video call.`,
      callRoom: room,
    };

    if (callPreviewMode) {
      setMessages((current) => [
        ...current,
        { ...invitation, id: `preview-call-${Date.now()}` },
      ]);
      setNotice("Video call invitation ready.");
      return;
    }
    if (!db) return;

    const callWindow = window.open("about:blank", "_blank");
    if (callWindow) {
      callWindow.opener = null;
      callWindow.document.title = "Starting Softly video call…";
      callWindow.document.body.innerHTML =
        '<p style="font:16px sans-serif;padding:24px">Starting your video call…</p>';
    }

    setCallStarting(true);
    try {
      await addDoc(collection(db, "messages"), {
        ...invitation,
        createdAt: serverTimestamp(),
      });
      if (callWindow) {
        callWindow.location.replace(callURL(room));
      }
      setNotice(
        callWindow
          ? "Video call opened and invitation sent."
          : "Invitation sent. Use the Join call button in chat.",
      );
      window.setTimeout(() => setNotice(""), 4000);
    } catch {
      callWindow?.close();
      setNotice("Video call could not start. Please try again.");
    } finally {
      setCallStarting(false);
    }
  };

  const relationship = (person) => {
    const sent = outgoing.find((item) => item.to === person.uid);
    const received = incoming.find((item) => item.from === person.uid);
    if (sent?.status === "accepted" || received?.status === "accepted") {
      return "connected";
    }
    if (sent?.status === "pending") return "requested";
    if (received?.status === "pending") return "incoming";
    return "none";
  };

  return (
    <main>
      {!firebaseReady && (
        <div className="setupBanner">
          Portfolio preview mode — add your free Firebase values in <b>.env</b>{" "}
          to enable Google login and live data.
        </div>
      )}

      <nav className="nav shell">
        <a className="brand" href="#top">
          softly<span>.</span>
        </a>
        <div className="navLinks">
          <a href="#stories">Stories</a>
          <button
            className="navTextButton"
            onClick={() =>
              requireUser(() => {
                setSocialOpen(true);
                setActiveChat(null);
              })
            }
          >
            People
            {incomingRequests.length > 0 && (
              <span className="notificationDot">{incomingRequests.length}</span>
            )}
          </button>
          <button
            className="writeButton"
            onClick={() => requireUser(() => setComposerOpen(true))}
          >
            Write a story <span>＋</span>
          </button>
          {user ? (
            <div className="account">
              <button
                className="accountProfile"
                onClick={openProfileEditor}
                title="Edit your profile"
              >
                <ProfileAvatar
                  person={{ displayName: currentName, photoURL: currentPhoto }}
                  tone="sage"
                />
                <span className="accountName">{currentName}</span>
              </button>
              <button className="signOut" onClick={() => signOut(auth)}>
                Sign out
              </button>
            </div>
          ) : (
            <button className="googleButton" onClick={login} disabled={authLoading}>
              <span className="googleG">G</span>
              {authLoading ? "Checking…" : "Continue with Google"}
            </button>
          )}
        </div>
      </nav>

      <section className="communityHero shell" id="top">
        <div className="heroCopy">
          <p className="eyebrow">A JOURNAL WRITTEN TOGETHER</p>
          <h1>
            Ideas. People.
            <br />
            Real <em>conversation.</em>
          </h1>
          <p className="heroIntro">
            Publish what you know, follow voices you value, and turn thoughtful
            stories into meaningful connections.
          </p>
          <div className="heroActions">
            <button
              className="primaryAction"
              onClick={() => requireUser(() => setComposerOpen(true))}
            >
              Start writing ↗
            </button>
            <a className="textLink" href="#stories">
              Explore stories <span>↓</span>
            </a>
          </div>
        </div>
        <div className="communityArt" aria-hidden="true">
          <div className="sun" />
          <div className="arch archOne" />
          <div className="arch archTwo" />
          <div className="floatingNote noteOne">FOLLOW</div>
          <div className="floatingNote noteTwo">CHAT</div>
          <div className="floatingHeart">♥</div>
        </div>
      </section>

      <section className="stories shell" id="stories">
        <div className="sectionHead">
          <div>
            <p className="eyebrow">FROM THE COMMUNITY</p>
            <h2>Fresh perspectives</h2>
          </div>
          <div className="searchField">
            <label htmlFor="search">Search stories</label>
            <input
              id="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search stories or writers"
            />
            <span>⌕</span>
          </div>
        </div>

        <div className="filters">
          {categories.map((item) => (
            <button
              key={item}
              className={category === item ? "active" : ""}
              onClick={() => setCategory(item)}
            >
              {item}
            </button>
          ))}
        </div>

        {visiblePosts.length ? (
          <div className="storyGrid">
            {visiblePosts.map((post, index) => {
              const postLikes = likesByPost[post.id] || [];
              const liked = user ? postLikes.includes(user.uid) : false;
              const liveAuthor =
                post.authorId === user?.uid
                  ? profile
                  : people.find((person) => person.uid === post.authorId);
              const authorName =
                liveAuthor?.displayName || post.authorName || "Softly writer";
              const authorPhoto =
                liveAuthor?.photoURL || post.authorPhoto || "";
              const videoDetails =
                post.mediaType === "video"
                  ? getVideoDetails(post.mediaURL)
                  : null;
              const mediaThumbnail =
                post.mediaType === "image"
                  ? post.mediaURL
                  : videoDetails?.thumbnail || "";
              return (
                <article className="storyCard" key={post.id}>
                  <div
                    className={`storyArt ${tones[index % 3]} ${
                      mediaThumbnail ? "hasMedia" : ""
                    }`}
                  >
                    {mediaThumbnail && (
                      <img
                        className="storyMediaImage"
                        src={mediaThumbnail}
                        alt=""
                        loading="lazy"
                        referrerPolicy="no-referrer"
                      />
                    )}
                    <span className="storyNumber">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    {!mediaThumbnail && <div className="artShape" />}
                    {post.mediaType === "video" && videoDetails && (
                      <span className="videoBadge">
                        ▶ {videoDetails.provider}
                      </span>
                    )}
                    <span>{post.category?.toUpperCase()}</span>
                  </div>
                  <div className="storyBody">
                    <div className="meta">
                      <span>
                        {post.createdAt?.toDate
                          ? post.createdAt
                              .toDate()
                              .toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                              })
                              .toUpperCase()
                          : "JUST NOW"}
                      </span>
                      <span>
                        {Math.max(2, Math.ceil((post.body?.length || 0) / 900))}{" "}
                        MIN READ
                      </span>
                    </div>
                    <h3>{post.title}</h3>
                    <p>{post.excerpt}</p>
                    {expanded === post.id && (
                      <>
                        {post.mediaType === "video" && videoDetails && (
                          <StoryVideo
                            details={videoDetails}
                            title={post.title}
                          />
                        )}
                        <p className="fullStory">{post.body}</p>
                      </>
                    )}
                    <button
                      className="readMore"
                      onClick={() =>
                        setExpanded(expanded === post.id ? null : post.id)
                      }
                    >
                      {expanded === post.id ? "Close story ↑" : "Read story →"}
                    </button>
                    <div className="byline">
                      <ProfileAvatar
                        person={{
                          displayName: authorName,
                          photoURL: authorPhoto,
                        }}
                        tone={tones[index % 3]}
                      />
                      <div>
                        <strong>{authorName}</strong>
                        <small>COMMUNITY WRITER</small>
                      </div>
                      {user?.uid === post.authorId && (
                        <button
                          className="storyDeleteButton"
                          onClick={() => setPostToDelete(post)}
                          title="Delete this story"
                        >
                          Delete
                        </button>
                      )}
                      <button
                        className={`likeButton ${liked ? "liked" : ""}`}
                        onClick={() => toggleLike(post.id)}
                      >
                        <span>{liked ? "♥" : "♡"}</span> {postLikes.length}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="emptyState">
            No stories yet. Sign in with Google and publish the first one.
          </div>
        )}
      </section>

      <section className="manifesto shell">
        <div className="quoteMark">“</div>
        <blockquote>
          A story can introduce an idea.
          <em> A conversation can turn it into something more.</em>
        </blockquote>
        <div className="manifestoSide">
          <p>OPEN COMMUNITY</p>
          <span>Write freely. Follow thoughtfully. Talk respectfully.</span>
        </div>
      </section>

      <section className="joinCard shell">
        <div>
          <p className="eyebrow">JOIN SOFTLY</p>
          <h2>Your next reader might become a friend.</h2>
          <p>
            Use your Google account to publish, follow writers, accept requests,
            and chat privately with your connections.
          </p>
        </div>
        <button className="primaryAction" onClick={user ? () => setSocialOpen(true) : login}>
          {user ? "Find people ↗" : "Continue with Google ↗"}
        </button>
      </section>

      <footer className="shell">
        <a className="brand" href="#top">
          softly<span>.</span>
        </a>
        <p>© 2026 Softly Community</p>
        <div>
          <a href="#stories">Stories</a>
          <button onClick={() => requireUser(() => setSocialOpen(true))}>
            People
          </button>
          <button onClick={() => requireUser(() => setComposerOpen(true))}>
            Write
          </button>
        </div>
      </footer>

      {composerOpen && (
        <div className="modalBackdrop">
          <section className="composer" role="dialog" aria-modal="true">
            <button className="modalClose" onClick={() => setComposerOpen(false)}>
              ×
            </button>
            <p className="eyebrow">NEW STORY</p>
            <h2>Share an idea.</h2>
            <form onSubmit={publish}>
              <label>
                Title
                <input
                  required
                  minLength={5}
                  maxLength={120}
                  value={draft.title}
                  onChange={(event) =>
                    setDraft({ ...draft, title: event.target.value })
                  }
                  placeholder="A clear, inviting title"
                />
              </label>
              <label>
                Short summary
                <textarea
                  required
                  minLength={15}
                  maxLength={260}
                  rows={2}
                  value={draft.excerpt}
                  onChange={(event) =>
                    setDraft({ ...draft, excerpt: event.target.value })
                  }
                  placeholder="What should readers know?"
                />
              </label>
              <label>
                Your story
                <textarea
                  required
                  minLength={40}
                  maxLength={6000}
                  rows={8}
                  value={draft.body}
                  onChange={(event) =>
                    setDraft({ ...draft, body: event.target.value })
                  }
                  placeholder="Write from your experience…"
                />
              </label>
              <div className="mediaComposer">
                <div className="mediaComposerHead">
                  <div>
                    <strong>Add media</strong>
                    <span>Optional</span>
                  </div>
                  {draft.mediaType && (
                    <button
                      type="button"
                      className="removeMediaButton"
                      onClick={() =>
                        setDraft({
                          ...draft,
                          mediaType: "",
                          mediaURL: "",
                        })
                      }
                    >
                      Remove
                    </button>
                  )}
                </div>

                <div className="mediaOptions">
                  <label className="storyPhotoButton">
                    <span>{mediaPreparing ? "Compressing…" : "＋ Add photo"}</span>
                    <small>JPG, PNG or WebP · max 15 MB</small>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={chooseStoryPhoto}
                      disabled={mediaPreparing}
                    />
                  </label>

                  <div className="mediaOr">OR</div>

                  <label className="videoLinkField">
                    Video link
                    <input
                      type="url"
                      value={
                        draft.mediaType === "video" ? draft.mediaURL : ""
                      }
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          mediaType: event.target.value ? "video" : "",
                          mediaURL: event.target.value,
                        })
                      }
                      placeholder="YouTube, Vimeo, Drive or direct MP4 link"
                    />
                  </label>
                </div>

                {draft.mediaType === "image" && draft.mediaURL && (
                  <div className="mediaPreview">
                    <img src={draft.mediaURL} alt="Story preview" />
                    <span>Photo ready</span>
                  </div>
                )}

                {draft.mediaType === "video" && draft.mediaURL && (
                  <div
                    className={`videoLinkStatus ${
                      draftVideoDetails ? "valid" : "invalid"
                    }`}
                  >
                    {draftVideoDetails
                      ? `✓ ${draftVideoDetails.provider} video ready`
                      : "Use a supported public HTTPS video link."}
                  </div>
                )}
              </div>
              <label>
                Category
                <select
                  value={draft.category}
                  onChange={(event) =>
                    setDraft({ ...draft, category: event.target.value })
                  }
                >
                  {categories.slice(1).map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
              <button
                className="publishButton"
                disabled={storyPublishing || mediaPreparing}
              >
                {storyPublishing ? "Publishing…" : "Publish story ↗"}
              </button>
            </form>
          </section>
        </div>
      )}

      {profileOpen && user && (
        <div className="modalBackdrop">
          <section
            className="composer profileEditor"
            role="dialog"
            aria-modal="true"
            aria-labelledby="profile-title"
          >
            <button
              className="modalClose"
              onClick={() => setProfileOpen(false)}
              aria-label="Close profile editor"
            >
              ×
            </button>
            <p className="eyebrow">YOUR PROFILE</p>
            <h2 id="profile-title">Make it yours.</h2>
            <form onSubmit={saveProfile}>
              <div className="profilePhotoEditor">
                <ProfileAvatar
                  person={{
                    displayName:
                      profileDraft.displayName || "Softly writer",
                    photoURL: profileDraft.photoURL,
                  }}
                  tone="peach"
                  large
                />
                <div>
                  <strong>Profile photo</strong>
                  <p>Choose a clear square photo. We compress it for free.</p>
                  <div className="profilePhotoActions">
                    <label className="fileButton">
                      Choose photo
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={chooseProfilePhoto}
                      />
                    </label>
                    {user.photoURL && (
                      <button
                        type="button"
                        className="profileTextButton"
                        onClick={() =>
                          setProfileDraft((current) => ({
                            ...current,
                            photoURL: user.photoURL,
                          }))
                        }
                      >
                        Use Google photo
                      </button>
                    )}
                    {profileDraft.photoURL && (
                      <button
                        type="button"
                        className="profileTextButton"
                        onClick={() =>
                          setProfileDraft((current) => ({
                            ...current,
                            photoURL: "",
                          }))
                        }
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <label>
                Display name
                <input
                  required
                  minLength={2}
                  maxLength={50}
                  value={profileDraft.displayName}
                  onChange={(event) =>
                    setProfileDraft({
                      ...profileDraft,
                      displayName: event.target.value,
                    })
                  }
                  placeholder="Your name"
                />
              </label>
              <label>
                Username
                <div className="usernameField">
                  <span>@</span>
                  <input
                    required
                    minLength={3}
                    maxLength={20}
                    pattern="[a-z0-9_]{3,20}"
                    value={profileDraft.username}
                    onChange={(event) =>
                      setProfileDraft({
                        ...profileDraft,
                        username: event.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9_]/g, ""),
                      })
                    }
                    placeholder="your_username"
                  />
                </div>
                <small className="fieldHint">
                  3–20 lowercase letters, numbers or underscore.
                </small>
              </label>
              <label>
                Bio
                <textarea
                  maxLength={220}
                  rows={3}
                  value={profileDraft.bio}
                  onChange={(event) =>
                    setProfileDraft({
                      ...profileDraft,
                      bio: event.target.value,
                    })
                  }
                  placeholder="Tell the community a little about yourself…"
                />
                <small className="fieldHint">
                  {profileDraft.bio.length}/220
                </small>
              </label>
              <button className="publishButton" disabled={profileSaving}>
                {profileSaving ? "Saving…" : "Save profile ↗"}
              </button>
            </form>
            <div className="dangerZone">
              <div>
                <strong>Delete account</strong>
                <p>
                  Permanently remove your profile, stories, likes,
                  connections and messages.
                </p>
              </div>
              <button type="button" onClick={openAccountDelete}>
                Delete account
              </button>
            </div>
          </section>
        </div>
      )}

      {postToDelete && user && (
        <div className="modalBackdrop">
          <section
            className="composer confirmModal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-story-title"
          >
            <button
              className="modalClose"
              onClick={() => setPostToDelete(null)}
              aria-label="Close"
              disabled={postDeleting}
            >
              ×
            </button>
            <p className="eyebrow">DELETE STORY</p>
            <h2 id="delete-story-title">Remove this story?</h2>
            <p className="confirmCopy">
              “{postToDelete.title}” and all its likes will be permanently
              removed.
            </p>
            <div className="confirmActions">
              <button
                className="cancelButton"
                onClick={() => setPostToDelete(null)}
                disabled={postDeleting}
              >
                Keep story
              </button>
              <button
                className="destructiveButton"
                onClick={deletePost}
                disabled={postDeleting}
              >
                {postDeleting ? "Deleting…" : "Delete permanently"}
              </button>
            </div>
          </section>
        </div>
      )}

      {accountDeleteOpen && user && (
        <div className="modalBackdrop">
          <section
            className="composer confirmModal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-account-title"
          >
            <button
              className="modalClose"
              onClick={() => setAccountDeleteOpen(false)}
              aria-label="Close"
              disabled={accountDeleting}
            >
              ×
            </button>
            <p className="eyebrow">DANGER ZONE</p>
            <h2 id="delete-account-title">Delete your account?</h2>
            <p className="confirmCopy">
              This permanently deletes your profile, reserved username,
              stories, likes, connections and private messages. Google will
              ask you to confirm your identity first.
            </p>
            <label className="deleteConfirmLabel">
              Type <strong>DELETE</strong> to continue
              <input
                value={accountDeleteText}
                onChange={(event) =>
                  setAccountDeleteText(event.target.value.toUpperCase())
                }
                maxLength={6}
                autoComplete="off"
                placeholder="DELETE"
                disabled={accountDeleting}
              />
            </label>
            <div className="confirmActions">
              <button
                className="cancelButton"
                onClick={() => setAccountDeleteOpen(false)}
                disabled={accountDeleting}
              >
                Cancel
              </button>
              <button
                className="destructiveButton"
                onClick={deleteAccountCompletely}
                disabled={
                  accountDeleteText !== "DELETE" || accountDeleting
                }
              >
                {accountDeleting
                  ? "Deleting everything…"
                  : "Delete my account"}
              </button>
            </div>
          </section>
        </div>
      )}

      {socialOpen && user && (
        <div className="modalBackdrop">
          <section className="socialPanel" role="dialog" aria-modal="true">
            <button
              className="modalClose"
              onClick={() => {
                setSocialOpen(false);
                setActiveChat(null);
              }}
            >
              ×
            </button>
            <div className="socialSidebar">
              <p className="eyebrow">YOUR COMMUNITY</p>
              <h2>People & chat</h2>

              <div className="profileSummary">
                <ProfileAvatar
                  person={{ displayName: currentName, photoURL: currentPhoto }}
                  tone="peach"
                  large
                />
                <div>
                  <strong>{currentName}</strong>
                  <small>
                    {profile?.username
                      ? `@${profile.username}`
                      : "Choose your username"}
                  </small>
                  {profile?.bio && <p>{profile.bio}</p>}
                </div>
                <button onClick={openProfileEditor}>Edit</button>
              </div>

              {incomingRequests.length > 0 && (
                <div className="requestSection">
                  <h3>Requests</h3>
                  {incomingRequests.map((request) => {
                    const person = people.find(
                      (item) => item.uid === request.from,
                    );
                    if (!person) return null;
                    return (
                      <div className="personRow" key={request.id}>
                        <ProfileAvatar person={person} tone="peach" />
                        <strong>{person.displayName}</strong>
                        <div className="requestActions">
                          <button onClick={() => answerRequest(request, true)}>
                            ✓
                          </button>
                          <button onClick={() => answerRequest(request, false)}>
                            ×
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="peopleSection">
                <h3>Discover people</h3>
                <div className="peopleSearch">
                  <span>@</span>
                  <input
                    value={peopleSearch}
                    onChange={(event) => setPeopleSearch(event.target.value)}
                    placeholder="Find by username or name"
                    aria-label="Find people by username or name"
                  />
                </div>
                {filteredPeople.length ? (
                  filteredPeople.map((person) => {
                    const status = relationship(person);
                    return (
                      <div className="personRow" key={person.uid}>
                        <ProfileAvatar person={person} tone="sage" />
                        <div className="personName">
                          <strong>{person.displayName}</strong>
                          <small>
                            {person.username
                              ? `@${person.username}`
                              : "No username yet"}
                            {" · "}
                            {status === "connected"
                              ? "Connected"
                              : status === "requested"
                                ? "Request sent"
                                : status === "incoming"
                                  ? "Wants to follow you"
                                  : "Softly writer"}
                          </small>
                        </div>
                        {status === "connected" ? (
                          <button
                            className="personAction connected"
                            onClick={() => setActiveChat(person)}
                          >
                            Chat
                          </button>
                        ) : status === "none" ? (
                          <button
                            className="personAction"
                            onClick={() => requestFollow(person)}
                          >
                            Follow
                          </button>
                        ) : status === "incoming" ? (
                          <button
                            className="personAction"
                            onClick={() => {
                              const request = incoming.find(
                                (item) => item.from === person.uid,
                              );
                              if (request) answerRequest(request, true);
                            }}
                          >
                            Accept
                          </button>
                        ) : (
                          <button className="personAction muted" disabled>
                            Pending
                          </button>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <p className="quietText">
                    {peopleSearch
                      ? "No matching people found."
                      : "More people will appear here after they join."}
                  </p>
                )}
              </div>
            </div>

            <div className="chatArea">
              {activeChat ? (
                <>
                  <header className="chatHeader">
                    <ProfileAvatar person={activeChat} tone="sky" />
                    <div className="chatIdentity">
                      <strong>{activeChat.displayName}</strong>
                      <small>PRIVATE CONVERSATION</small>
                    </div>
                    <button
                      className="videoCallButton"
                      type="button"
                      onClick={startVideoCall}
                      disabled={callStarting}
                    >
                      <span aria-hidden="true">◉</span>
                      {callStarting ? "Starting…" : "Video call"}
                    </button>
                    <button
                      className="removeConnection"
                      onClick={() => removeFollow(activeChat)}
                    >
                      Remove
                    </button>
                  </header>
                  <div className="messageList">
                    {messages.length ? (
                      messages.map((item) =>
                        item.messageType === "video_call" &&
                        item.callRoom ? (
                          <article
                            className={`callInvitation ${
                              item.senderId === user.uid ? "mine" : ""
                            }`}
                            key={item.id}
                          >
                            <div className="callInvitationIcon" aria-hidden="true">
                              ◉
                            </div>
                            <div>
                              <small>
                                {item.senderId === user.uid
                                  ? "YOU STARTED A CALL"
                                  : "VIDEO CALL INVITATION"}
                              </small>
                              <strong>
                                {item.senderId === user.uid
                                  ? `Waiting for ${activeChat.displayName}`
                                  : `${activeChat.displayName} invited you`}
                              </strong>
                              <p>
                                Camera and microphone permissions are requested
                                after you join.
                              </p>
                              <a
                                href={callURL(item.callRoom)}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                Join video call ↗
                              </a>
                            </div>
                          </article>
                        ) : (
                          <div
                            className={`messageBubble ${
                              item.senderId === user.uid ? "mine" : ""
                            }`}
                            key={item.id}
                          >
                            {item.text}
                          </div>
                        ),
                      )
                    ) : (
                      <p className="chatEmpty">
                        You’re connected. Say something thoughtful.
                      </p>
                    )}
                  </div>
                  <form className="messageForm" onSubmit={sendMessage}>
                    <input
                      value={message}
                      onChange={(event) => setMessage(event.target.value)}
                      maxLength={1000}
                      placeholder="Write a message…"
                    />
                    <button>Send ↗</button>
                  </form>
                </>
              ) : (
                <div className="chatPlaceholder">
                  <div className="floatingHeart">♥</div>
                  <h3>Choose a connection</h3>
                  <p>
                    Accept a follow request or connect with someone to start a
                    private conversation.
                  </p>
                  {connections.length > 0 && (
                    <div className="connectionChips">
                      {connections.map((person) => (
                        <button
                          key={person.uid}
                          onClick={() => setActiveChat(person)}
                        >
                          {initials(person.displayName)} {person.displayName}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {notice && <div className="toast">✓ {notice}</div>}
    </main>
  );
}
