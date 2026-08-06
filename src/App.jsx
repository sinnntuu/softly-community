import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, m, useReducedMotion } from "framer-motion";
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
  authPersistenceReady,
  db,
  firebaseReady,
  googleProvider,
} from "./firebase";
import { ThemeToggle } from "./components/Experience";
import { AchievementPanel, StoryGridSkeleton } from "./components/CommunityStates";
import RoomHub from "./components/RoomHub";
import { cleanText, escapeHTML, safeFileName } from "./lib/text";
import {
  ArrowLeft,
  Award,
  Bell,
  BellRing,
  Bookmark,
  BookOpen,
  CheckCheck,
  Clock3,
  Download,
  Flame,
  GraduationCap,
  HandHeart,
  Heart,
  HeartPulse,
  ImagePlus,
  Inbox,
  Landmark,
  Leaf,
  Lightbulb,
  Link2,
  LogOut,
  Menu,
  MessageCircle,
  MessageSquareText,
  Palette,
  Paperclip,
  Pencil,
  Search as SearchIcon,
  Send,
  Share2,
  Sparkles,
  Star,
  Trash2,
  Undo2,
  UserCheck,
  UserPlus,
  UsersRound,
  Video,
  X,
} from "lucide-react";

async function showDeviceNotification(item) {
  if (
    typeof window === "undefined" ||
    !("Notification" in window) ||
    Notification.permission !== "granted"
  ) {
    return;
  }

  const options = {
    body: `${item.title}\n${item.detail}`,
    icon: "/og-community.png",
    tag: item.id,
    data: { url: "/" },
  };

  try {
    if ("serviceWorker" in navigator) {
      const registration =
        (await navigator.serviceWorker.getRegistration("/")) ||
        (await navigator.serviceWorker.register("/softly-notifications-sw.js"));
      await registration.showNotification("Softly", options);
      return;
    }
    new Notification("Softly", options);
  } catch {
    // The in-app notification still appears when a browser blocks system alerts.
  }
}

const themeOptions = [
  {
    name: "Creative Expression",
    icon: Palette,
    description: "Art, design, photography and original creative ideas.",
    keywords: ["art", "design", "creative", "photo", "photography", "expression"],
    template: {
      title: "The story behind [your creative work]",
      summary: "Introduce the feeling, idea or experience that inspired your work.",
      sections: ["What inspired me", "How I created it", "What I hope people feel"],
    },
  },
  {
    name: "Culture & Heritage",
    icon: Landmark,
    description: "Traditions, identity, local stories and shared heritage.",
    keywords: ["culture", "heritage", "tradition", "identity", "local", "history"],
    template: {
      title: "A tradition from [place/community] worth preserving",
      summary: "Share a cultural memory and explain why it still matters today.",
      sections: ["The tradition or memory", "What it means to us", "How we can preserve it"],
    },
  },
  {
    name: "Technology for Good",
    icon: Lightbulb,
    description: "Useful technology that improves everyday life.",
    keywords: ["technology", "tech", "digital", "innovation", "app", "future"],
    template: {
      title: "Using technology to solve [real problem]",
      summary: "Describe the problem, your solution and the people it can help.",
      sections: ["The problem I noticed", "My technology idea", "Real-world impact and next steps"],
    },
  },
  {
    name: "Life & Wellbeing",
    icon: HeartPulse,
    description: "Personal growth, mental health and meaningful living.",
    keywords: ["life", "wellbeing", "health", "growth", "mind", "experience"],
    template: {
      title: "What [an experience] taught me about wellbeing",
      summary: "Reflect on a personal moment and the lesson readers can use.",
      sections: ["What happened", "What I felt and learned", "A practical thought for others"],
    },
  },
  {
    name: "Nature & Sustainability",
    icon: Leaf,
    description: "Nature, climate action and sustainable choices.",
    keywords: ["nature", "climate", "green", "environment", "sustainable", "earth"],
    template: {
      title: "One sustainable change for [home/campus/community]",
      summary: "Show an environmental challenge and a realistic action people can take.",
      sections: ["What I observed", "Why it matters", "The change I propose"],
    },
  },
  {
    name: "Student Innovation",
    icon: GraduationCap,
    description: "Student-built solutions, experiments and fresh thinking.",
    keywords: ["student", "college", "school", "idea", "project", "solution"],
    template: {
      title: "A student idea that can improve [problem/place]",
      summary: "Explain your observation, prototype or solution and what you learned.",
      sections: ["The challenge", "My idea or experiment", "What worked, what changed, what comes next"],
    },
  },
  {
    name: "Social Impact",
    icon: HandHeart,
    description: "Ideas that strengthen communities and create change.",
    keywords: ["social", "community", "impact", "people", "change", "help"],
    template: {
      title: "How we can create change for [people/community]",
      summary: "Tell a human story, identify the need and suggest a practical action.",
      sections: ["The people and need", "Why the issue matters", "A useful path forward"],
    },
  },
];
const themes = ["All themes", ...themeOptions.map((item) => item.name)];
const legacyThemeMap = {
  Design: "Creative Expression",
  Culture: "Culture & Heritage",
  Technology: "Technology for Good",
  Life: "Life & Wellbeing",
};
const storyTheme = (post) =>
  post?.theme || legacyThemeMap[post?.category] || post?.category || "Creative Expression";
const meaningfulnessAnalysis = (post) => {
  const theme = storyTheme(post);
  const definition = themeOptions.find((item) => item.name === theme);
  const body = post?.body?.trim?.() || "";
  const text = `${post?.title || ""} ${post?.excerpt || ""} ${body}`.toLowerCase();
  if (!text.trim()) {
    return {
      stars: 0,
      criteria: { relevance: 0, depth: 0, reflection: 0, specificity: 0, usefulness: 0 },
      feedback: "Start writing to receive private analyzer guidance.",
    };
  }

  const keywordHits = new Set(
    (definition?.keywords || []).filter((keyword) => text.includes(keyword)),
  ).size;
  const relevance = Math.min(2, keywordHits * 0.5 + (text.includes(theme.toLowerCase()) ? 0.5 : 0));
  const sentenceCount = (body.match(/[.!?]+(?:\s|$)/g) || []).length;
  const paragraphCount = body.split(/\n\s*\n/).filter((item) => item.trim()).length;
  const depth = Math.min(2, (body.length >= 250 ? 0.7 : 0.25) + (body.length >= 700 ? 0.65 : 0) + (sentenceCount >= 5 ? 0.35 : 0) + (paragraphCount >= 3 ? 0.3 : 0));
  const reflectionWords = ["learned", "realized", "felt", "experience", "because", "changed", "understand", "believe", "meaning"];
  const reflectionHits = reflectionWords.filter((word) => text.includes(word)).length;
  const reflection = Math.min(2, reflectionHits * 0.32 + (/\b(i|my|we|our)\b/.test(text) ? 0.55 : 0));
  const specificitySignals = [/[0-9]/, /\b(today|yesterday|year|month|day|campus|school|college|village|city|home)\b/, /\b(for example|such as|when|where)\b/];
  const specificity = Math.min(2, specificitySignals.reduce((score, pattern) => score + (pattern.test(text) ? 0.55 : 0), 0) + (body.length >= 450 ? 0.35 : 0));
  const usefulWords = ["solution", "action", "improve", "help", "change", "can", "should", "next", "practice", "create"];
  const usefulHits = usefulWords.filter((word) => text.includes(word)).length;
  const usefulness = Math.min(2, usefulHits * 0.3 + (/\b(first|second|finally|next step)\b/.test(text) ? 0.5 : 0));
  const criteria = { relevance, depth, reflection, specificity, usefulness };
  const stars = Math.max(
    1,
    Math.min(10, Math.round(Object.values(criteria).reduce((sum, value) => sum + value, 0))),
  );
  const labels = {
    relevance: "connect the story more clearly to the selected theme",
    depth: "add more detail and structure to the story",
    reflection: "explain what you felt, learned or realised",
    specificity: "include a concrete example, place, moment or detail",
    usefulness: "end with a useful insight or practical next step",
  };
  const weakest = Object.entries(criteria).sort((a, b) => a[1] - b[1])[0]?.[0];
  return {
    stars,
    criteria,
    feedback:
      stars >= 9
        ? "Strong, specific and meaningful. A final proofread will make it ready."
        : `To make it more meaningful, ${labels[weakest]}.`,
  };
};
const tones = ["peach", "sage", "sky"];

const initials = (name = "Softly writer") =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

const timeValue = (value) =>
  value?.toMillis?.() ??
  (value instanceof Date ? value.getTime() : typeof value === "number" ? value : 0);

const relativeChatTime = (value) => {
  const timestamp = timeValue(value);
  if (!timestamp) return "New";
  const elapsed = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(elapsed / 60000);
  if (minutes < 1) return "Now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
};

const chatMessagePreview = (item, currentUserId) => {
  if (!item) return "Connected — start a conversation";
  const labels = {
    photo: "Shared a photo",
    video: "Shared a video",
    link: "Shared a link",
    audio_call: "Started an audio call",
    video_call: "Started a video call",
  };
  const content =
    item.messageType === "text"
      ? item.text || "Sent a message"
      : labels[item.messageType] || "Sent a message";
  return `${item.senderId === currentUserId ? "You: " : ""}${content}`.slice(0, 76);
};
const chatId = (a, b) => [a, b].sort().join("_");
const callURL = (room, type = "video") => {
  const base = `https://meet.jit.si/${encodeURIComponent(room)}`;
  return type === "audio"
    ? `${base}#config.startAudioOnly=true&config.startWithVideoMuted=true`
    : base;
};
const safeHTTPSURL = (value) => {
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
};
const linkHost = (value) => {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "Shared link";
  }
};
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

function StarRating({ value = 0, compact = false }) {
  const rounded = Math.max(0, Math.min(10, Math.round(value)));
  return (
    <span
      className={`starRating ${compact ? "compact" : ""}`}
      aria-label={`${rounded} meaningfulness stars out of 10`}
      title={`${rounded}/10 meaningfulness stars`}
    >
      <span className="starIcons" aria-hidden="true">
        {Array.from({ length: 10 }, (_, index) => (
          <Star
            key={index}
            size={compact ? 10 : 13}
            strokeWidth={2}
            className={index < rounded ? "filled" : ""}
          />
        ))}
      </span>
      <strong>{rounded}/10</strong>
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
  const reduceMotion = useReducedMotion();
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
  const previewMessages = callPreviewMode
    ? [
        {
          id: "preview-text",
          senderId: previewConnection.uid,
          receiverId: "local-feature-preview",
          participants: [previewConnection.uid, "local-feature-preview"],
          messageType: "text",
          text: "Want to discuss your latest story?",
          createdAt: { toMillis: () => Date.now() - 120000 },
        },
      ]
    : [];
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
  const [dataLoading, setDataLoading] = useState(true);
  const [posts, setPosts] = useState([]);
  const [likes, setLikes] = useState([]);
  const [comments, setComments] = useState([]);
  const [bookmarks, setBookmarks] = useState([]);
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
  const [messages, setMessages] = useState(previewMessages);
  const [allMessages, setAllMessages] = useState(previewMessages);
  const [themeFilter, setThemeFilter] = useState("All themes");
  const [search, setSearch] = useState("");
  const [feedMode, setFeedMode] = useState("Latest");
  const [commentDrafts, setCommentDrafts] = useState({});
  const [composerOpen, setComposerOpen] = useState(false);
  const [socialOpen, setSocialOpen] = useState(callPreviewMode);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [mediaPreparing, setMediaPreparing] = useState(false);
  const [storyPublishing, setStoryPublishing] = useState(false);
  const [callStarting, setCallStarting] = useState("");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [roomOpen, setRoomOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [socialTarget, setSocialTarget] = useState("people");
  const [seenNotifications, setSeenNotifications] = useState([]);
  const [notificationPermission, setNotificationPermission] = useState(() =>
    typeof window !== "undefined" && "Notification" in window
      ? Notification.permission
      : "unsupported",
  );
  const knownNotificationIds = useRef(new Set());
  const notificationsReady = useRef(false);
  const messageListRef = useRef(null);
  const undoMessageTimerRef = useRef(null);
  const [postToDelete, setPostToDelete] = useState(null);
  const [postDeleting, setPostDeleting] = useState(false);
  const [accountDeleteOpen, setAccountDeleteOpen] = useState(false);
  const [accountDeleteText, setAccountDeleteText] = useState("");
  const [accountDeleting, setAccountDeleting] = useState(false);
  const [peopleSearch, setPeopleSearch] = useState("");
  const [chatSearch, setChatSearch] = useState("");
  const [activeChat, setActiveChat] = useState(previewConnection);
  const [message, setMessage] = useState("");
  const [editingMessage, setEditingMessage] = useState(null);
  const [messageActionBusy, setMessageActionBusy] = useState("");
  const [deletedMessage, setDeletedMessage] = useState(null);
  const [attachmentOpen, setAttachmentOpen] = useState(false);
  const [attachmentPreparing, setAttachmentPreparing] = useState(false);
  const [chatAttachment, setChatAttachment] = useState({
    type: "link",
    url: "",
  });
  const [expanded, setExpanded] = useState(null);
  const [notice, setNotice] = useState("");
  const [draft, setDraft] = useState({
    title: "",
    excerpt: "",
    body: "",
    theme: "Student Innovation",
    mediaType: "",
    mediaURL: "",
  });
  const [profileDraft, setProfileDraft] = useState({
    displayName: "",
    username: "",
    bio: "",
    location: "",
    website: "",
    photoURL: "",
  });

  useEffect(
    () => () => {
      if (undoMessageTimerRef.current) {
        window.clearTimeout(undoMessageTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    const overlayOpen =
      composerOpen ||
      profileOpen ||
      socialOpen ||
      notificationsOpen ||
      roomOpen ||
      Boolean(postToDelete) ||
      accountDeleteOpen;
    if (!overlayOpen) return;

    const previouslyFocused = document.activeElement;
    document.body.classList.add("overlayOpen");
    const surface = document.querySelector(
      ".modalBackdrop:last-of-type [role='dialog'], .modalBackdrop:last-of-type [role='alertdialog'], .socialPanel, .notificationPanel",
    );
    const focusable = () =>
      [...(surface?.querySelectorAll(
        "button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])",
      ) || [])];
    window.setTimeout(() => focusable()[0]?.focus(), 20);

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        if (accountDeleting || postDeleting || storyPublishing || profileSaving) return;
        setNotificationsOpen(false);
        setRoomOpen(false);
        setComposerOpen(false);
        setProfileOpen(false);
        setSocialOpen(false);
        setPostToDelete(null);
        setAccountDeleteOpen(false);
        return;
      }
      if (event.key !== "Tab" || !surface) return;
      const elements = focusable();
      if (!elements.length) return;
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.classList.remove("overlayOpen");
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [
    composerOpen,
    profileOpen,
    socialOpen,
    notificationsOpen,
    roomOpen,
    postToDelete,
    accountDeleteOpen,
    accountDeleting,
    postDeleting,
    storyPublishing,
    profileSaving,
  ]);

  useEffect(() => {
    if (localPreviewMode) {
      setAuthLoading(false);
      return;
    }
    if (!firebaseReady || !auth) {
      setAuthLoading(false);
      setDataLoading(false);
      return;
    }
    getRedirectResult(auth).catch((error) => {
      setNotice(
        error?.code === "auth/unauthorized-domain"
          ? "This website domain is not authorised in Firebase yet."
          : "Google sign-in could not finish. Please try again.",
      );
    });
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
    const stopPosts = onSnapshot(
      postQuery,
      (snapshot) => {
        setPosts(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
        setDataLoading(false);
      },
      () => {
        setDataLoading(false);
        setNotice("Stories could not refresh. Check your connection and try again.");
      },
    );
    const stopLikes = onSnapshot(collection(db, "likes"), (snapshot) => {
      setLikes(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
    });
    const stopComments = onSnapshot(collection(db, "comments"), (snapshot) => {
      setComments(
        snapshot.docs.map((item) => ({ id: item.id, ...item.data() })),
      );
    });
    return () => {
      stopPosts();
      stopLikes();
      stopComments();
    };
  }, []);

  useEffect(() => {
    if (localPreviewMode) return;
    if (!user || !db) {
      setBookmarks([]);
      setAllMessages([]);
      setSeenNotifications([]);
      return;
    }
    const stopBookmarks = onSnapshot(
      query(collection(db, "bookmarks"), where("userId", "==", user.uid)),
      (snapshot) =>
        setBookmarks(
          snapshot.docs.map((item) => ({ id: item.id, ...item.data() })),
        ),
    );
    const stopMessages = onSnapshot(
      query(
        collection(db, "messages"),
        where("participants", "array-contains", user.uid),
        limit(100),
      ),
      (snapshot) =>
        setAllMessages(
          snapshot.docs.map((item) => ({ id: item.id, ...item.data() })),
        ),
    );
    const stopNotificationReads = onSnapshot(
      collection(db, "notificationReads", user.uid, "items"),
      (snapshot) => setSeenNotifications(snapshot.docs.map((item) => item.id)),
    );
    return () => {
      stopBookmarks();
      stopMessages();
      stopNotificationReads();
    };
  }, [user]);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setNotificationPermission("unsupported");
      return;
    }
    setNotificationPermission(Notification.permission);
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/softly-notifications-sw.js")
        .catch(() => {});
    }
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

  useEffect(() => {
    const messageList = messageListRef.current;
    if (!socialOpen || socialTarget !== "chat" || !messageList) return;
    const frame = window.requestAnimationFrame(() => {
      messageList.scrollTo({
        top: messageList.scrollHeight,
        behavior: reduceMotion ? "auto" : "smooth",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [messages, activeChat, socialOpen, socialTarget, reduceMotion]);

  useEffect(() => {
    if (!socialOpen || !["requests", "accept"].includes(socialTarget)) return;
    const timer = window.setTimeout(() => {
      document
        .getElementById("follow-requests")
        ?.scrollIntoView({
          behavior: reduceMotion ? "auto" : "smooth",
          block: "start",
        });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [socialOpen, socialTarget, reduceMotion]);

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
    const savedIds = new Set(bookmarks.map((item) => item.postId));
    const commentCounts = comments.reduce((result, item) => {
      result[item.postId] = (result[item.postId] || 0) + 1;
      return result;
    }, {});
    const matches = posts.filter((post) => {
      const themeMatch =
        themeFilter === "All themes" || storyTheme(post) === themeFilter;
      const searchMatch =
        !term ||
        `${post.title} ${post.excerpt} ${post.body} ${storyTheme(post)} ${post.authorName} ${post.authorUsername || ""}`
          .toLowerCase()
          .includes(term);
      const savedMatch = feedMode !== "Saved" || savedIds.has(post.id);
      return themeMatch && searchMatch && savedMatch;
    });
    if (feedMode === "Trending") {
      return [...matches].sort(
        (a, b) =>
          (likesByPost[b.id]?.length || 0) * 2 +
            (commentCounts[b.id] || 0) * 3 -
            ((likesByPost[a.id]?.length || 0) * 2 +
              (commentCounts[a.id] || 0) * 3) ||
          timeValue(b.createdAt) - timeValue(a.createdAt),
      );
    }
    return [...matches].sort(
      (a, b) => timeValue(b.createdAt) - timeValue(a.createdAt),
    );
  }, [posts, search, themeFilter, feedMode, bookmarks, likesByPost, comments]);

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

  const followers = useMemo(() => {
    const ids = new Set(
      incoming
        .filter((item) => item.status === "accepted")
        .map((item) => item.from),
    );
    return people.filter((person) => ids.has(person.uid));
  }, [people, incoming]);

  const following = useMemo(() => {
    const ids = new Set(
      outgoing
        .filter((item) => item.status === "accepted")
        .map((item) => item.to),
    );
    return people.filter((person) => ids.has(person.uid));
  }, [people, outgoing]);

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
  const selectedTheme = useMemo(
    () => themeOptions.find((item) => item.name === draft.theme) || themeOptions[0],
    [draft.theme],
  );
  const SelectedThemeIcon = selectedTheme.icon;
  const draftAnalysis = useMemo(
    () => meaningfulnessAnalysis(draft),
    [draft],
  );
  const commentsByPost = useMemo(() => {
    const result = {};
    for (const comment of comments) {
      result[comment.postId] ??= [];
      result[comment.postId].push(comment);
    }
    Object.values(result).forEach((items) =>
      items.sort((a, b) => timeValue(a.createdAt) - timeValue(b.createdAt)),
    );
    return result;
  }, [comments]);
  const bookmarkedPostIds = useMemo(
    () => new Set(bookmarks.map((item) => item.postId)),
    [bookmarks],
  );
  const achievements = useMemo(() => {
    const ownPosts = posts.filter((post) => post.authorId === user?.uid);
    const ownPostIds = new Set(ownPosts.map((post) => post.id));
    const receivedLikes = likes.filter((item) => ownPostIds.has(item.postId)).length;
    const writtenComments = comments.filter((item) => item.authorId === user?.uid).length;
    const bestStars = ownPosts.reduce(
      (best, post) => Math.max(best, meaningfulnessAnalysis(post).stars),
      0,
    );
    return [
      { id: "first-story", label: "First Voice", detail: "Published a first story", icon: BookOpen, unlocked: ownPosts.length > 0 },
      { id: "meaning-maker", label: "Meaning Maker", detail: "Earned 8+ meaningfulness stars", icon: Sparkles, unlocked: bestStars >= 8 },
      { id: "conversation", label: "Conversation Starter", detail: "Added 3 thoughtful comments", icon: MessageSquareText, unlocked: writtenComments >= 3 },
      { id: "community", label: "Community Favourite", detail: "Received 5 story likes", icon: Heart, unlocked: receivedLikes >= 5 },
      { id: "connected", label: "Connected Writer", detail: "Made 3 community connections", icon: Award, unlocked: connections.length >= 3 },
    ];
  }, [posts, likes, comments, user, connections.length]);
  const revealMotion = reduceMotion
    ? {}
    : {
        initial: { opacity: 0, y: 24 },
        whileInView: { opacity: 1, y: 0 },
        viewport: { once: true, amount: 0.12 },
        transition: { duration: 0.52, ease: [0.22, 1, 0.36, 1] },
      };
  const notificationItems = useMemo(() => {
    if (!user) return [];
    const personFor = (uid) =>
      uid === user.uid ? profile : people.find((person) => person.uid === uid);
    const ownedPosts = new Map(
      posts.filter((post) => post.authorId === user.uid).map((post) => [post.id, post]),
    );
    const items = [];

    incomingRequests.forEach((request) => {
      const person = personFor(request.from);
      items.push({
        id: `follow-${request.id}`,
        type: "follow",
        actorId: request.from,
        title: `${person?.displayName || request.fromName || "A writer"} wants to follow you`,
        detail: "Review the follow request.",
        createdAt: request.createdAt,
      });
    });
    outgoing
      .filter((request) => request.status === "accepted")
      .forEach((request) => {
        const person = personFor(request.to);
        items.push({
          id: `connected-${request.id}`,
          type: "accepted",
          actorId: request.to,
          title: `${person?.displayName || request.toName || "A writer"} accepted your follow request`,
          detail: "You can now start a private conversation.",
          createdAt: request.updatedAt,
        });
      });
    likes.forEach((like) => {
      const post = ownedPosts.get(like.postId);
      if (!post || like.userId === user.uid) return;
      const person = personFor(like.userId);
      items.push({
        id: `like-${like.id}`,
        type: "post",
        postId: like.postId,
        title: `${person?.displayName || "Someone"} liked your story`,
        detail: post.title,
        createdAt: like.createdAt,
      });
    });
    comments.forEach((comment) => {
      const post = ownedPosts.get(comment.postId);
      if (!post || comment.authorId === user.uid) return;
      items.push({
        id: `comment-${comment.id}`,
        type: "post",
        postId: comment.postId,
        title: `${comment.authorName || "Someone"} commented on your story`,
        detail: comment.text,
        createdAt: comment.createdAt,
      });
    });
    allMessages.forEach((item) => {
      if (item.receiverId !== user.uid || item.senderId === user.uid) return;
      const person = personFor(item.senderId);
      const descriptions = {
        video_call: "invited you to a video call",
        audio_call: "invited you to an audio call",
        photo: "shared a photo",
        video: "shared a video",
        link: "shared a link",
        text: "sent you a message",
      };
      items.push({
        id: `message-${item.id}`,
        type: "message",
        actorId: item.senderId,
        title: `${person?.displayName || "Someone"} ${descriptions[item.messageType] || "sent a message"}`,
        detail:
          item.messageType === "text"
            ? (item.text || "Open your private conversation.").slice(0, 90)
            : "Open your private conversation.",
        createdAt: item.createdAt,
      });
    });
    return items
      .sort((a, b) => timeValue(b.createdAt) - timeValue(a.createdAt))
      .slice(0, 24);
  }, [user, profile, people, posts, likes, comments, allMessages, incomingRequests, outgoing]);
  const unreadNotificationItems = useMemo(() => {
    const seen = new Set(seenNotifications);
    return notificationItems.filter((item) => !seen.has(item.id));
  }, [notificationItems, seenNotifications]);
  const unreadNotifications = unreadNotificationItems.length;
  const unreadMessages = unreadNotificationItems.filter(
    (item) => item.type === "message",
  ).length;
  const chatThreads = useMemo(() => {
    const term = chatSearch.trim().toLowerCase();
    const unreadByPerson = unreadNotificationItems.reduce((counts, item) => {
      if (item.type === "message" && item.actorId) {
        counts[item.actorId] = (counts[item.actorId] || 0) + 1;
      }
      return counts;
    }, {});

    return connections
      .map((person) => {
        const latestMessage = allMessages
          .filter((item) => item.participants?.includes(person.uid))
          .sort((a, b) => timeValue(b.createdAt) - timeValue(a.createdAt))[0];
        return {
          ...person,
          latestMessage,
          preview: chatMessagePreview(latestMessage, user?.uid),
          unread: unreadByPerson[person.uid] || 0,
          timestamp: timeValue(latestMessage?.createdAt),
        };
      })
      .filter((person) =>
        !term ||
        `${person.displayName || ""} ${person.username || ""} ${person.preview}`
          .toLowerCase()
          .includes(term),
      )
      .sort(
        (a, b) =>
          b.timestamp - a.timestamp ||
          (a.displayName || "").localeCompare(b.displayName || ""),
      );
  }, [connections, allMessages, chatSearch, unreadNotificationItems, user?.uid]);

  useEffect(() => {
    knownNotificationIds.current = new Set();
    notificationsReady.current = false;
    if (!user) return;
    const timer = window.setTimeout(() => {
      notificationsReady.current = true;
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const currentIds = new Set(notificationItems.map((item) => item.id));
    if (!notificationsReady.current) {
      knownNotificationIds.current = currentIds;
      return;
    }
    const newest = notificationItems.find(
      (item) => !knownNotificationIds.current.has(item.id),
    );
    knownNotificationIds.current = currentIds;
    if (newest) {
      setNotice(`New notification: ${newest.title}`);
      if (!seenNotifications.includes(newest.id)) {
        showDeviceNotification(newest);
      }
      window.setTimeout(() => setNotice(""), 4500);
    }
  }, [notificationItems, seenNotifications, user]);
  const searchSuggestions = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (term.length < 2) return [];
    const values = new Set();
    posts.forEach((post) => {
      [post.title, post.authorName, post.authorUsername, storyTheme(post)].forEach((value) => {
        if (value?.toLowerCase().includes(term)) values.add(value);
      });
    });
    people.forEach((person) => {
      [person.displayName, person.username ? `@${person.username}` : ""].forEach(
        (value) => {
          if (value?.toLowerCase().includes(term)) values.add(value);
        },
      );
    });
    return [...values].slice(0, 6);
  }, [search, posts, people]);

  const openNotifications = () => {
    setNotificationsOpen(true);
  };

  const markNotificationSeen = (item) => {
    if (!item || !user) return;
    setSeenNotifications((current) =>
      current.includes(item.id) ? current : [...current, item.id],
    );
    if (localPreviewMode || !db) return;
    setDoc(doc(db, "notificationReads", user.uid, "items", item.id), {
      notificationId: item.id,
      readAt: serverTimestamp(),
    }).catch(() => {
      setNotice("Could not update the notification. Please try again.");
    });
  };

  const markAllNotificationsSeen = async () => {
    if (!user || !unreadNotificationItems.length) return;
    const ids = unreadNotificationItems.map((item) => item.id);
    setSeenNotifications((current) => [...new Set([...current, ...ids])]);
    if (localPreviewMode || !db) return;
    try {
      const batch = writeBatch(db);
      unreadNotificationItems.forEach((item) => {
        batch.set(doc(db, "notificationReads", user.uid, "items", item.id), {
          notificationId: item.id,
          readAt: serverTimestamp(),
        });
      });
      await batch.commit();
    } catch {
      setNotice("Could not mark notifications as seen. Please try again.");
    }
  };

  const enableDeviceNotifications = async () => {
    if (!("Notification" in window)) {
      setNotificationPermission("unsupported");
      setNotice("System notifications are not supported by this browser.");
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      setNotice(
        permission === "granted"
          ? "Phone and browser alerts are enabled while Softly is active."
          : "Notification permission was not enabled.",
      );
    } catch {
      setNotice("Notification permission could not be opened.");
    }
  };

  const openNotification = (item) => {
    markNotificationSeen(item);
    setNotificationsOpen(false);
    if (item.type === "post") {
      setExpanded(item.postId);
      document.getElementById("stories")?.scrollIntoView({ behavior: "smooth" });
      return;
    }
    setSocialTarget(
      item.type === "message" || item.type === "accepted" ? "chat" : "requests",
    );
    setSocialOpen(true);
    if (item.type === "message" || item.type === "accepted") {
      setActiveChat(people.find((person) => person.uid === item.actorId) || null);
    }
  };

  const logout = async () => {
    setNotificationsOpen(false);
    setSocialOpen(false);
    setProfileOpen(false);
    if (localPreviewMode) {
      setNotice("Logout control is ready.");
      return;
    }
    try {
      if (auth) await signOut(auth);
    } catch {
      setNotice("Could not log out. Please check your connection and try again.");
    }
  };

  const login = async () => {
    if (!auth) {
      setNotice("Google sign-in is loading. Please refresh and try again.");
      return;
    }
    setAuthLoading(true);
    try {
      await authPersistenceReady;
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      if (error?.code === "auth/popup-closed-by-user") {
        setNotice("Sign-in window was closed. Tap Google sign-in to try again.");
        setAuthLoading(false);
        return;
      }
      if (error?.code === "auth/popup-blocked") {
        setNotice("Your browser blocked the sign-in window. Redirecting securely…");
      } else if (error?.code === "auth/network-request-failed") {
        setNotice("Sign-in needs an internet connection. Please reconnect and try again.");
        setAuthLoading(false);
        return;
      }
      try {
        await authPersistenceReady;
        await signInWithRedirect(auth, googleProvider);
      } catch (redirectError) {
        setNotice(
          redirectError?.code === "auth/unauthorized-domain"
            ? "This website is not authorised in Firebase Authentication."
            : "Google sign-in could not start. Please refresh and try once more.",
        );
        setAuthLoading(false);
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

  const openChatPanel = () =>
    requireUser(() => {
      setNotificationsOpen(false);
      setSocialTarget("chat");
      setActiveChat(null);
      setEditingMessage(null);
      setMessage("");
      setSocialOpen(true);
    });

  const openConversation = (person) => {
    if (!person) return;
    setNotificationsOpen(false);
    setSocialTarget("chat");
    setActiveChat(person);
    setEditingMessage(null);
    setMessage("");
    setAttachmentOpen(false);
    setSocialOpen(true);
  };

  const openSocialSection = (target) =>
    requireUser(() => {
      setNotificationsOpen(false);
      setSocialTarget(target);
      setSocialOpen(true);
      if (target !== "chat") setActiveChat(null);
    });

  const openProfileEditor = () => {
    setSocialOpen(false);
    setActiveChat(null);
    setProfileDraft({
      displayName: currentName,
      username: profile?.username || "",
      bio: profile?.bio || "",
      location: profile?.location || "",
      website: profile?.website || "",
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
    const location = profileDraft.location.trim().slice(0, 80);
    const website = profileDraft.website.trim()
      ? safeHTTPSURL(profileDraft.website)
      : "";

    if (displayName.length < 2 || displayName.length > 50) {
      setNotice("Display name must be between 2 and 50 characters.");
      return;
    }
    if (!usernamePattern.test(username)) {
      setNotice("Username needs 3–20 lowercase letters, numbers or _ only.");
      return;
    }
    if (profileDraft.website.trim() && !website) {
      setNotice("Website must be a secure https:// link.");
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
            location,
            website,
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

  const applyThemeTemplate = () => {
    const template = selectedTheme.template;
    setDraft((current) => ({
      ...current,
      title: current.title || template.title,
      excerpt: current.excerpt || template.summary,
      body:
        current.body ||
        template.sections
          .map((section) => `${section}\n[Write 2–3 honest and specific sentences here.]`)
          .join("\n\n"),
    }));
    setNotice("Theme template added. Replace the prompts with your own story.");
    window.setTimeout(() => setNotice(""), 3000);
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

    const title = cleanText(draft.title, 120);
    const excerpt = cleanText(draft.excerpt, 260);
    const body = cleanText(draft.body, 6000);
    if (title.length < 5) {
      setNotice("Add a clear title with at least 5 characters.");
      return;
    }
    if (excerpt.length < 15) {
      setNotice("Add a short summary with at least 15 characters.");
      return;
    }
    if (body.length < 40) {
      setNotice("Your story needs at least 40 characters before publishing.");
      return;
    }
    if (!themeOptions.some((item) => item.name === draft.theme)) {
      setNotice("Please choose one of the available event themes.");
      return;
    }

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
        title,
        excerpt,
        body,
        theme: draft.theme,
        category: draft.theme,
        authorId: user.uid,
        authorName: currentName,
        authorUsername: profile?.username || "",
        authorPhoto: currentPhoto,
        meaningfulnessStars: draftAnalysis.stars,
        analysisVersion: "local-meaning-v1",
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
        theme: "Student Innovation",
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
    try {
      if (liked) {
        await deleteDoc(doc(db, "likes", id));
      } else {
        await setDoc(doc(db, "likes", id), {
          postId,
          userId: user.uid,
          createdAt: serverTimestamp(),
        });
      }
    } catch {
      setNotice("Like could not be updated. Check your connection and try again.");
    }
  };

  const toggleBookmark = async (postId) => {
    if (!user || !db) {
      login();
      return;
    }
    const id = `${postId}_${user.uid}`;
    try {
      if (bookmarkedPostIds.has(postId)) {
        await deleteDoc(doc(db, "bookmarks", id));
        setNotice("Removed from bookmarks.");
      } else {
        await setDoc(doc(db, "bookmarks", id), {
          postId,
          userId: user.uid,
          createdAt: serverTimestamp(),
        });
        setNotice("Story bookmarked.");
      }
      window.setTimeout(() => setNotice(""), 2400);
    } catch {
      setNotice("Bookmark could not be updated. Please try again.");
    }
  };

  const addComment = async (event, postId) => {
    event.preventDefault();
    const text = cleanText(commentDrafts[postId], 500);
    if (!user || !db) {
      login();
      return;
    }
    if (!text) return;
    try {
      await addDoc(collection(db, "comments"), {
        postId,
        authorId: user.uid,
        authorName: currentName,
        authorPhoto: currentPhoto,
        text,
        createdAt: serverTimestamp(),
      });
      setCommentDrafts((current) => ({ ...current, [postId]: "" }));
    } catch {
      setNotice("Comment could not be posted. Please try again.");
    }
  };

  const deleteComment = async (comment) => {
    if (!user || !db || comment.authorId !== user.uid) return;
    try {
      await deleteDoc(doc(db, "comments", comment.id));
      setNotice("Comment deleted.");
    } catch {
      setNotice("Comment could not be deleted. Please try again.");
    }
  };

  const shareStory = async (post) => {
    const url = `${window.location.origin}${window.location.pathname}#story-${post.id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: post.title, text: post.excerpt, url });
      } else {
        await navigator.clipboard.writeText(url);
        setNotice("Story link copied.");
        window.setTimeout(() => setNotice(""), 2400);
      }
    } catch (error) {
      if (error?.name !== "AbortError") setNotice("Story could not be shared.");
    }
  };

  const downloadStory = (post) => {
    const analysis = meaningfulnessAnalysis(post);
    const author = post.authorUsername
      ? `@${post.authorUsername}`
      : post.authorName || "Softly writer";
    const image =
      post.mediaType === "image" && post.mediaURL
        ? `<img class="cover" src="${escapeHTML(post.mediaURL)}" alt="Story photo">`
        : "";
    const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHTML(post.title)} — Softly</title><style>
body{margin:0;background:#e9e7df;color:#20241f;font-family:Arial,sans-serif}.page{max-width:760px;margin:0 auto;padding:40px 24px 70px}.brand{font:700 28px Georgia,serif}.brand i{color:#da7059}.theme{margin-top:48px;color:#da7059;font-size:11px;font-weight:700;letter-spacing:.14em}.cover{width:100%;max-height:460px;object-fit:cover;margin:24px 0;border-radius:24px}h1{font:500 48px/1.05 Georgia,serif;letter-spacing:-1.5px;margin:14px 0}h2{font:400 20px/1.5 Georgia,serif;color:#62675f}.meta{display:flex;justify-content:space-between;gap:20px;margin:24px 0;padding:16px 0;border-top:1px solid #c8c6bd;border-bottom:1px solid #c8c6bd;font-size:12px}.stars{color:#da7059;font-weight:700}.story{white-space:pre-wrap;font:18px/1.8 Georgia,serif}.footer{margin-top:54px;color:#747871;font-size:11px}
</style></head><body><main class="page"><div class="brand">softly<i>.</i></div><div class="theme">${escapeHTML(storyTheme(post)).toUpperCase()}</div>${image}<h1>${escapeHTML(post.title)}</h1><h2>${escapeHTML(post.excerpt)}</h2><div class="meta"><strong>${escapeHTML(author)}</strong><span class="stars">★ ${analysis.stars}/10 meaningfulness</span></div><article class="story">${escapeHTML(post.body)}</article><div class="footer">Downloaded from Softly Community · Founder SINTU KUMAR RAI</div></main></body></html>`;
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${safeFileName(post.title)}-softly.html`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1200);
    setNotice("Story saved to your Downloads with its photo and text.");
    window.setTimeout(() => setNotice(""), 3200);
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
      const [postLikes, postComments, postBookmarks] = await Promise.all([
        getDocs(query(collection(db, "likes"), where("postId", "==", postToDelete.id))),
        getDocs(query(collection(db, "comments"), where("postId", "==", postToDelete.id))),
        getDocs(query(collection(db, "bookmarks"), where("postId", "==", postToDelete.id))),
      ]);
      await deleteRefsInChunks(
        db,
        [...postLikes.docs, ...postComments.docs, ...postBookmarks.docs].map(
          (item) => item.ref,
        ),
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
        ownComments,
        ownBookmarks,
        notificationReads,
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
        getDocs(
          query(collection(db, "comments"), where("authorId", "==", user.uid)),
        ),
        getDocs(
          query(collection(db, "bookmarks"), where("userId", "==", user.uid)),
        ),
        getDocs(collection(db, "notificationReads", user.uid, "items")),
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
      const commentsOnAuthoredPosts = await Promise.all(
        authoredPosts.docs.map((postItem) =>
          getDocs(
            query(
              collection(db, "comments"),
              where("postId", "==", postItem.id),
            ),
          ),
        ),
      );
      const bookmarksOnAuthoredPosts = await Promise.all(
        authoredPosts.docs.map((postItem) =>
          getDocs(
            query(
              collection(db, "bookmarks"),
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
        ...ownComments.docs.map((item) => item.ref),
        ...ownBookmarks.docs.map((item) => item.ref),
        ...notificationReads.docs.map((item) => item.ref),
        ...likesOnAuthoredPosts.flatMap((snapshot) =>
          snapshot.docs.map((item) => item.ref),
        ),
        ...commentsOnAuthoredPosts.flatMap((snapshot) =>
          snapshot.docs.map((item) => item.ref),
        ),
        ...bookmarksOnAuthoredPosts.flatMap((snapshot) =>
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
    try {
      await setDoc(doc(db, "follows", `${user.uid}_${person.uid}`), {
        from: user.uid,
        to: person.uid,
        fromName: currentName,
        toName: person.displayName || "Softly writer",
        status: "pending",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setNotice(`Follow request sent to ${person.displayName || "this writer"}.`);
    } catch {
      setNotice("Follow request could not be sent. Please try again.");
    }
  };

  const answerRequest = async (request, accepted) => {
    if (!db) return;
    try {
      if (accepted) {
        await updateDoc(doc(db, "follows", request.id), {
          status: "accepted",
          updatedAt: serverTimestamp(),
        });
      } else {
        await deleteDoc(doc(db, "follows", request.id));
      }
      setNotice(accepted ? "Follow request accepted." : "Follow request declined.");
    } catch {
      setNotice("Request could not be updated. Please try again.");
    }
  };

  const removeFollow = async (person) => {
    if (!user || !db) return;
    const outgoingMatch = outgoing.find((item) => item.to === person.uid);
    const incomingMatch = incoming.find((item) => item.from === person.uid);
    try {
      if (outgoingMatch) await deleteDoc(doc(db, "follows", outgoingMatch.id));
      if (incomingMatch) await deleteDoc(doc(db, "follows", incomingMatch.id));
      if (activeChat?.uid === person.uid) setActiveChat(null);
      setNotice(`${person.displayName || "Connection"} removed.`);
    } catch {
      setNotice("Connection could not be removed. Please try again.");
    }
  };

  const sendMessage = async (event) => {
    event.preventDefault();
    const text = cleanText(message, 1000);
    if (!text || !user || !activeChat) return;
    if (editingMessage) {
      if (
        editingMessage.senderId !== user.uid ||
        editingMessage.messageType !== "text"
      ) {
        setNotice("Only your own text messages can be edited.");
        return;
      }
      setMessageActionBusy(editingMessage.id);
      try {
        if (callPreviewMode) {
          const updateMessage = (item) =>
            item.id === editingMessage.id
              ? {
                  ...item,
                  text,
                  editedAt: { toMillis: () => Date.now() },
                }
              : item;
          setMessages((current) => current.map(updateMessage));
          setAllMessages((current) => current.map(updateMessage));
        } else if (db) {
          await updateDoc(doc(db, "messages", editingMessage.id), {
            text,
            editedAt: serverTimestamp(),
          });
        }
        setEditingMessage(null);
        setMessage("");
        setNotice("Message updated.");
      } catch {
        setNotice("Message could not be edited. Please try again.");
      } finally {
        setMessageActionBusy("");
      }
      return;
    }
    if (callPreviewMode) {
      const preview = {
        id: `preview-message-${Date.now()}`,
        senderId: user.uid,
        receiverId: activeChat.uid,
        participants: [user.uid, activeChat.uid],
        messageType: "text",
        text,
        createdAt: { toMillis: () => Date.now() },
      };
      setMessages((current) => [...current, preview]);
      setAllMessages((current) => [...current, preview]);
      setMessage("");
      return;
    }
    if (!db) return;
    try {
      await addDoc(collection(db, "messages"), {
        chatId: chatId(user.uid, activeChat.uid),
        senderId: user.uid,
        receiverId: activeChat.uid,
        participants: [user.uid, activeChat.uid],
        messageType: "text",
        text,
        createdAt: serverTimestamp(),
      });
      setMessage("");
    } catch {
      setNotice("Message could not be sent. Check the connection and try again.");
    }
  };

  const beginMessageEdit = (item) => {
    if (!user || item.senderId !== user.uid || item.messageType !== "text") return;
    setEditingMessage(item);
    setMessage(item.text || "");
    setAttachmentOpen(false);
  };

  const cancelMessageEdit = () => {
    setEditingMessage(null);
    setMessage("");
  };

  const deleteMessage = async (item) => {
    if (!user || item.senderId !== user.uid || messageActionBusy) return;
    setMessageActionBusy(item.id);
    const payload = Object.fromEntries(
      Object.entries(item).filter(
        ([key, value]) => key !== "id" && value !== undefined && value !== null,
      ),
    );
    try {
      if (callPreviewMode) {
        setMessages((current) => current.filter((messageItem) => messageItem.id !== item.id));
        setAllMessages((current) => current.filter((messageItem) => messageItem.id !== item.id));
      } else if (db) {
        await deleteDoc(doc(db, "messages", item.id));
      }
      if (editingMessage?.id === item.id) cancelMessageEdit();
      if (undoMessageTimerRef.current) {
        window.clearTimeout(undoMessageTimerRef.current);
      }
      setDeletedMessage({ id: item.id, payload });
      undoMessageTimerRef.current = window.setTimeout(() => {
        setDeletedMessage(null);
        undoMessageTimerRef.current = null;
      }, 7000);
    } catch {
      setNotice("Message could not be deleted. Please try again.");
    } finally {
      setMessageActionBusy("");
    }
  };

  const undoDeleteMessage = async () => {
    if (!deletedMessage || !user || messageActionBusy) return;
    const restored = { id: deletedMessage.id, ...deletedMessage.payload };
    setMessageActionBusy(deletedMessage.id);
    try {
      if (callPreviewMode) {
        setMessages((current) =>
          [...current, restored].sort(
            (a, b) => timeValue(a.createdAt) - timeValue(b.createdAt),
          ),
        );
        setAllMessages((current) => [...current, restored]);
      } else if (db) {
        const restorePayload = {
          ...deletedMessage.payload,
          createdAt: deletedMessage.payload.createdAt?.toMillis
            ? deletedMessage.payload.createdAt
            : serverTimestamp(),
        };
        await setDoc(doc(db, "messages", deletedMessage.id), restorePayload);
      }
      if (undoMessageTimerRef.current) {
        window.clearTimeout(undoMessageTimerRef.current);
        undoMessageTimerRef.current = null;
      }
      setDeletedMessage(null);
      setNotice("Message restored.");
    } catch {
      setNotice("Message could not be restored. The undo window may have expired.");
    } finally {
      setMessageActionBusy("");
    }
  };

  const chooseChatPhoto = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setAttachmentPreparing(true);
    try {
      const url = await compressStoryPhoto(file);
      setChatAttachment({ type: "photo", url });
    } catch (error) {
      setNotice(error.message || "Photo could not be prepared.");
    } finally {
      setAttachmentPreparing(false);
    }
  };

  const sendChatAttachment = async (event) => {
    event.preventDefault();
    if (!user || !activeChat || attachmentPreparing) return;
    const type = chatAttachment.type;
    const mediaURL =
      type === "photo"
        ? chatAttachment.url
        : safeHTTPSURL(chatAttachment.url || "");
    if (!mediaURL) {
      setNotice("Please add a valid secure link.");
      return;
    }
    if (type === "video" && !getVideoDetails(mediaURL)) {
      setNotice("Use a YouTube, Vimeo, Google Drive or direct video link.");
      return;
    }
    const sharedMessage = {
      chatId: chatId(user.uid, activeChat.uid),
      senderId: user.uid,
      receiverId: activeChat.uid,
      participants: [user.uid, activeChat.uid],
      messageType: type,
      mediaURL,
      text: `Shared a ${type}.`,
    };
    if (callPreviewMode) {
      const preview = {
        ...sharedMessage,
        id: `preview-attachment-${Date.now()}`,
        createdAt: { toMillis: () => Date.now() },
      };
      setMessages((current) => [...current, preview]);
      setAllMessages((current) => [...current, preview]);
    } else if (db) {
      await addDoc(collection(db, "messages"), {
        ...sharedMessage,
        createdAt: serverTimestamp(),
      });
    }
    setChatAttachment({ type: "link", url: "" });
    setAttachmentOpen(false);
  };

  const startCall = async (type) => {
    if (!user || !activeChat || callStarting) return;

    const room = createCallRoom();
    const isAudio = type === "audio";
    const invitation = {
      chatId: chatId(user.uid, activeChat.uid),
      senderId: user.uid,
      receiverId: activeChat.uid,
      participants: [user.uid, activeChat.uid],
      messageType: isAudio ? "audio_call" : "video_call",
      text: `${currentName} started an ${isAudio ? "audio" : "video"} call.`,
      callRoom: room,
    };

    if (callPreviewMode) {
      const preview = {
          ...invitation,
          id: `preview-call-${Date.now()}`,
          createdAt: { toMillis: () => Date.now() },
        };
      setMessages((current) => [...current, preview]);
      setAllMessages((current) => [...current, preview]);
      setNotice(`${isAudio ? "Audio" : "Video"} call invitation ready.`);
      return;
    }
    if (!db) return;

    const callWindow = window.open("about:blank", "_blank");
    if (callWindow) {
      callWindow.opener = null;
      callWindow.document.title = `Starting Softly ${type} call…`;
      callWindow.document.body.innerHTML =
        `<p style="font:16px sans-serif;padding:24px">Starting your ${type} call…</p>`;
    }

    setCallStarting(type);
    try {
      await addDoc(collection(db, "messages"), {
        ...invitation,
        createdAt: serverTimestamp(),
      });
      if (callWindow) {
        callWindow.location.replace(callURL(room, type));
      }
      setNotice(
        callWindow
          ? `${isAudio ? "Audio" : "Video"} call opened and invitation sent.`
          : "Invitation sent. Use the Join call button in chat.",
      );
      window.setTimeout(() => setNotice(""), 4000);
    } catch {
      callWindow?.close();
      setNotice(`${isAudio ? "Audio" : "Video"} call could not start.`);
    } finally {
      setCallStarting("");
    }
  };

  const startVideoCall = () => startCall("video");
  const startAudioCall = () => startCall("audio");

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
    <>
      <a className="skipLink" href="#main-content">
        Skip to main content
      </a>
    <main id="main-content">
      {!firebaseReady && (
        <div className="setupBanner">
          Portfolio preview mode — add your free Firebase values in <b>.env</b>{" "}
          to enable Google login and live data.
        </div>
      )}

      <m.nav
        className="nav shell"
        aria-label="Primary navigation"
        initial={reduceMotion ? false : { opacity: 0, y: -14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.42 }}
      >
        <a className="brand" href="#top" aria-label="Softly home">
          softly<span>.</span>
        </a>
        <button
          type="button"
          className="mobileMenuToggle"
          aria-expanded={mobileNavOpen}
          aria-controls="primary-navigation"
          aria-label={mobileNavOpen ? "Close navigation" : "Open navigation"}
          onClick={() => setMobileNavOpen((current) => !current)}
        >
          {mobileNavOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        <div
          className={`navLinks ${mobileNavOpen ? "open" : ""}`}
          id="primary-navigation"
        >
          <a href="#stories" onClick={() => setMobileNavOpen(false)}>Stories</a>
          <button
            className="navTextButton navRoomButton"
            onClick={() =>
              requireUser(() => {
                setRoomOpen(true);
                setMobileNavOpen(false);
              })
            }
          >
            <UsersRound size={15} /> Challenges
          </button>
          <button
            className="navTextButton"
            onClick={() =>
              requireUser(() => {
                setSocialTarget("people");
                setSocialOpen(true);
                setActiveChat(null);
                setMobileNavOpen(false);
              })
            }
          >
            <UserPlus size={15} /> People
            {incomingRequests.length > 0 && (
              <span className="notificationDot">{incomingRequests.length}</span>
            )}
          </button>
          <button
            className="writeButton"
            onClick={() =>
              requireUser(() => {
                setComposerOpen(true);
                setMobileNavOpen(false);
              })
            }
          >
            Write a story <span>＋</span>
          </button>
          <ThemeToggle />
          {user ? (
            <div className="account">
              <button
                className="notificationBell"
                onClick={openNotifications}
                aria-label={`Notifications${unreadNotifications ? `, ${unreadNotifications} new` : ""}`}
                title="Notifications"
              >
                <Bell size={17} />
                {unreadNotifications > 0 && (
                  <span>{Math.min(unreadNotifications, 9)}</span>
                )}
              </button>
              <button
                className="accountProfile"
                onClick={() => {
                  openProfileEditor();
                  setMobileNavOpen(false);
                }}
                title="Edit your profile"
              >
                <ProfileAvatar
                  person={{ displayName: currentName, photoURL: currentPhoto }}
                  tone="sage"
                />
                <span className="accountName">{currentName}</span>
              </button>
              <button className="signOut" onClick={logout}>
                <LogOut size={13} /> Log out
              </button>
            </div>
          ) : (
            <button className="googleButton" onClick={login} disabled={authLoading}>
              <span className="googleG">G</span>
              {authLoading ? "Checking…" : "Continue with Google"}
            </button>
          )}
        </div>
      </m.nav>

      {notificationsOpen && user && (
        <div
          className="notificationBackdrop"
          onClick={() => setNotificationsOpen(false)}
        >
          <section
            className="notificationPanel"
            aria-label="Notifications"
            onClick={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <p className="eyebrow">ACTIVITY</p>
                <h2>Notifications</h2>
              </div>
              <button
                className="modalClose modalBack"
                type="button"
                onClick={() => setNotificationsOpen(false)}
                aria-label="Back from notifications"
              >
                <ArrowLeft size={14} /> <span>Back</span>
              </button>
            </header>
            <div className="notificationTools" aria-label="Notification controls">
              <button
                type="button"
                onClick={enableDeviceNotifications}
                disabled={notificationPermission === "granted" || notificationPermission === "unsupported"}
              >
                <BellRing size={14} />
                {notificationPermission === "granted"
                  ? "Phone alerts on"
                  : notificationPermission === "unsupported"
                    ? "Alerts unavailable"
                    : "Enable phone alerts"}
              </button>
              <button
                type="button"
                onClick={markAllNotificationsSeen}
                disabled={!unreadNotificationItems.length}
              >
                <CheckCheck size={14} /> Mark all seen
              </button>
            </div>
            <div className="notificationList">
              {unreadNotificationItems.length ? (
                unreadNotificationItems.map((item) => (
                  <button key={item.id} onClick={() => openNotification(item)}>
                    <span className={`notificationIcon ${item.type}`}>
                      {item.type === "follow"
                        ? <Inbox size={15} />
                        : item.type === "accepted"
                          ? <UserCheck size={15} />
                        : item.type === "message"
                          ? <MessageCircle size={15} />
                          : <Heart size={15} />}
                    </span>
                    <span>
                      <strong>{item.title}</strong>
                      <small>{item.detail}</small>
                    </span>
                  </button>
                ))
              ) : (
                <div className="notificationEmpty">
                  <span><Bell size={28} /></span>
                  <strong>You’re all caught up</strong>
                  <p>New follows, comments, likes and messages appear here.</p>
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      <m.section className="communityHero shell" id="top" initial={false}>
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
      </m.section>

      <m.section className="challengeOption shell" id="challenge" {...revealMotion}>
        <span className="challengeOptionIcon"><UsersRound size={24} /></span>
        <div>
          <h2>Run a private thought and photo challenge.</h2>
          <p>
            Softly stays a simple blogging community. When an institution wants an
            activity, an organizer can create a code-based room, invite participants,
            save the complete history and reveal a meaningfulness-ranked result.
          </p>
        </div>
        <div className="challengeOptionActions">
          <button
            className="secondaryAction roomEventButton"
            onClick={() => requireUser(() => setRoomOpen(true))}
          >
            <UsersRound size={15} /> Open challenge rooms
          </button>
          <span>Private code · photo entries · saved history</span>
        </div>
      </m.section>

      <m.section className="stories shell" id="stories" {...revealMotion}>
        <div className="sectionHead">
          <div>
            <p className="eyebrow">FROM THE COMMUNITY</p>
            <h2>Fresh stories</h2>
          </div>
          <div className="searchField">
            <label htmlFor="search">Search stories</label>
            <input
              id="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search topics, stories or usernames"
            />
            <span><SearchIcon size={16} /></span>
            {searchSuggestions.length > 0 && (
              <div className="searchSuggestions">
                {searchSuggestions.map((item) => (
                  <button key={item} onClick={() => setSearch(item)}>
                    <span><SearchIcon size={13} /></span> {item}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="discoveryControls">
          <div className="filters" aria-label="Story topics">
            {themes.map((item) => (
              <button
                key={item}
                className={themeFilter === item ? "active" : ""}
                onClick={() => setThemeFilter(item)}
              >
                {item}
              </button>
            ))}
          </div>
          <div className="feedModes" aria-label="Feed order">
            {["Latest", "Trending", "Saved"].map((item) => (
              <button
                key={item}
                className={feedMode === item ? "active" : ""}
                onClick={() =>
                  item === "Saved"
                    ? requireUser(() => setFeedMode(item))
                    : setFeedMode(item)
                }
              >
                {item === "Saved" ? (
                  <><Bookmark size={13} /> Saved</>
                ) : item === "Trending" ? (
                  <><Flame size={13} /> Trending</>
                ) : item}
              </button>
            ))}
          </div>
        </div>

        {dataLoading ? (
          <StoryGridSkeleton />
        ) : visiblePosts.length ? (
          <div className="storyGrid">
            {visiblePosts.map((post, index) => {
              const postLikes = likesByPost[post.id] || [];
              const postComments = commentsByPost[post.id] || [];
              const postAnalysis = meaningfulnessAnalysis(post);
              const liked = user ? postLikes.includes(user.uid) : false;
              const bookmarked = bookmarkedPostIds.has(post.id);
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
                <m.article
                  layout={!reduceMotion}
                  className="storyCard"
                  id={`story-${post.id}`}
                  key={post.id}
                  whileHover={reduceMotion ? undefined : { y: -5 }}
                  transition={{ duration: 0.2 }}
                >
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
                        loading={index < 2 ? "eager" : "lazy"}
                        decoding="async"
                        fetchPriority={index === 0 ? "high" : "auto"}
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
                    <span>{storyTheme(post).toUpperCase()}</span>
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
                        <StarRating value={postAnalysis.stars} compact /> · {Math.max(2, Math.ceil((post.body?.length || 0) / 900))}{" "}
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
                        <section className="commentSection">
                          <header>
                            <strong>Conversation</strong>
                            <span>{postComments.length} comments</span>
                          </header>
                          {postComments.length > 0 && (
                            <div className="commentList">
                              {postComments.map((comment) => (
                                <article key={comment.id}>
                                  <ProfileAvatar
                                    person={{
                                      displayName: comment.authorName,
                                      photoURL: comment.authorPhoto,
                                    }}
                                    tone="sage"
                                  />
                                  <div>
                                    <strong>{comment.authorName}</strong>
                                    <p>{comment.text}</p>
                                  </div>
                                  {comment.authorId === user?.uid && (
                                    <button
                                      onClick={() => deleteComment(comment)}
                                      aria-label="Delete comment"
                                    >
                                      ×
                                    </button>
                                  )}
                                </article>
                              ))}
                            </div>
                          )}
                          <form onSubmit={(event) => addComment(event, post.id)}>
                            <input
                              value={commentDrafts[post.id] || ""}
                              onChange={(event) =>
                                setCommentDrafts((current) => ({
                                  ...current,
                                  [post.id]: event.target.value,
                                }))
                              }
                              maxLength={500}
                              placeholder={
                                user ? "Add to the conversation…" : "Sign in to comment"
                              }
                            />
                            <button>{user ? "Post" : "Sign in"}</button>
                          </form>
                        </section>
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
                      <div className="storyActions">
                        <button
                          className="commentButton"
                          onClick={() => setExpanded(post.id)}
                          aria-label={`Open ${postComments.length} comments`}
                          title="Open comments"
                        >
                          <MessageSquareText size={14} /> {postComments.length}
                        </button>
                        <button
                          className={`likeButton ${liked ? "liked" : ""}`}
                          onClick={() => toggleLike(post.id)}
                          aria-label={liked ? "Unlike story" : "Like story"}
                        >
                          <Heart size={15} fill={liked ? "currentColor" : "none"} /> {postLikes.length}
                        </button>
                        <button
                          className={`bookmarkButton ${bookmarked ? "saved" : ""}`}
                          onClick={() => toggleBookmark(post.id)}
                          aria-label={bookmarked ? "Remove bookmark" : "Bookmark story"}
                          title={bookmarked ? "Saved" : "Save story"}
                        >
                          <Bookmark size={15} fill={bookmarked ? "currentColor" : "none"} />
                        </button>
                        <button
                          className="shareStoryButton"
                          onClick={() => shareStory(post)}
                          aria-label="Share story"
                          title="Share story"
                        >
                          <Share2 size={15} />
                        </button>
                        <button
                          className="downloadStoryButton"
                          onClick={() => downloadStory(post)}
                          aria-label="Download story with photo"
                          title="Download story to this device"
                        >
                          <Download size={15} />
                        </button>
                      </div>
                    </div>
                  </div>
                </m.article>
              );
            })}
          </div>
        ) : (
          <div className="emptyState">
            No stories yet. Sign in with Google and publish the first one.
          </div>
        )}
      </m.section>

      <m.section className="manifesto shell" {...revealMotion}>
        <div className="quoteMark">“</div>
        <blockquote>
          A story can introduce an idea.
          <em> A conversation can turn it into something more.</em>
        </blockquote>
        <div className="manifestoSide">
          <p>OPEN COMMUNITY</p>
          <span>Write freely. Follow thoughtfully. Talk respectfully.</span>
        </div>
      </m.section>

      <m.section className="joinCard shell" {...revealMotion}>
        <div>
          <p className="eyebrow">JOIN SOFTLY</p>
          <h2>Your next reader might become a friend.</h2>
          <p>
            Use your Google account to publish, follow writers, accept requests,
            and chat privately with your connections.
          </p>
        </div>
        <button className="primaryAction" onClick={() => openSocialSection("people")}>
          {user ? "Find people ↗" : "Continue with Google ↗"}
        </button>
      </m.section>

      <footer className="siteFooter">
        <div className="shell footerGrid">
          <div className="footerBrand">
            <a className="brand" href="#top">
              softly<span>.</span>
            </a>
            <p>
              A calm place for original ideas, meaningful stories and real
              conversations.
            </p>
          </div>
          <div>
            <strong>Explore</strong>
            <a href="#stories">Latest stories</a>
            <button onClick={() => setFeedMode("Trending")}>Trending</button>
            <button onClick={() => requireUser(() => setFeedMode("Saved"))}>
              Bookmarks
            </button>
          </div>
          <div>
            <strong>Community</strong>
            <button onClick={() => openSocialSection("people")}>
              Discover people
            </button>
            <button onClick={() => requireUser(() => setComposerOpen(true))}>
              Write a story
            </button>
            <button onClick={() => requireUser(() => setRoomOpen(true))}>
              Challenge rooms
            </button>
            {user && <button onClick={openProfileEditor}>Your profile</button>}
          </div>
          <div className="footerNote">
            <strong>Founder</strong>
            <p className="founderName">SINTU KUMAR RAI</p>
            <p>Built with care for thoughtful writers and readers.</p>
          </div>
        </div>
        <div className="shell footerBottom">
          <span>© 2026 Softly Community</span>
          <span>Made with care for writers and readers.</span>
        </div>
      </footer>

      <m.nav
        className="communityDock"
        aria-label="Community shortcuts"
        initial={reduceMotion ? false : { opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <button
          type="button"
          className={socialOpen && socialTarget === "chat" ? "active" : ""}
          onClick={openChatPanel}
          aria-label={`Open chat${unreadMessages ? `, ${unreadMessages} new messages` : ""}`}
        >
          <MessageCircle size={18} />
          <span>Chat</span>
          {unreadMessages > 0 && <b>{Math.min(unreadMessages, 9)}</b>}
        </button>
        <button
          type="button"
          className={socialOpen && socialTarget === "followers" ? "active" : ""}
          onClick={() => openSocialSection("followers")}
          aria-label={`Open followers${followers.length ? `, ${followers.length} people` : ""}`}
        >
          <UserPlus size={18} />
          <span>Followers</span>
        </button>
        <button
          type="button"
          className={socialOpen && socialTarget === "requests" ? "active" : ""}
          onClick={() => openSocialSection("requests")}
          aria-label={`Open follow requests${incomingRequests.length ? `, ${incomingRequests.length} pending` : ""}`}
        >
          <Inbox size={18} />
          <span>Requests</span>
          {incomingRequests.length > 0 && <b>{Math.min(incomingRequests.length, 9)}</b>}
        </button>
        <button
          type="button"
          className={socialOpen && socialTarget === "following" ? "active" : ""}
          onClick={() => openSocialSection("following")}
          aria-label={`Open following${following.length ? `, ${following.length} people` : ""}`}
        >
          <UserCheck size={18} />
          <span>Following</span>
        </button>
        <button
          type="button"
          className={notificationsOpen ? "active" : ""}
          onClick={() => requireUser(openNotifications)}
          aria-label={`Open notifications${unreadNotifications ? `, ${unreadNotifications} new` : ""}`}
        >
          <Bell size={18} />
          <span>Alerts</span>
          {unreadNotifications > 0 && <b>{Math.min(unreadNotifications, 9)}</b>}
        </button>
      </m.nav>

      {roomOpen && user && db && (
        <RoomHub
          db={db}
          user={user}
          profile={profile}
          themeOptions={themeOptions}
          analyzeThought={meaningfulnessAnalysis}
          preparePhoto={compressStoryPhoto}
          onClose={() => setRoomOpen(false)}
          onNotice={setNotice}
        />
      )}

      {composerOpen && (
        <div className="modalBackdrop">
          <section className="composer" role="dialog" aria-modal="true">
            <button
              className="modalClose modalBack"
              type="button"
              onClick={() => setComposerOpen(false)}
              aria-label="Back from story editor"
            >
              <ArrowLeft size={14} /> <span>Back</span>
            </button>
            <p className="eyebrow">NEW STORY</p>
            <h2>Share an idea.</h2>
            <form onSubmit={publish}>
              <div className="themeTemplatePicker">
                <label>
                  Choose a topic
                  <select
                    value={draft.theme}
                    onChange={(event) =>
                      setDraft({ ...draft, theme: event.target.value })
                    }
                  >
                    {themeOptions.map((item) => (
                      <option key={item.name}>{item.name}</option>
                    ))}
                  </select>
                </label>
                <div className="templateSuggestion">
                  <span className="templateIcon"><SelectedThemeIcon size={19} /></span>
                  <div>
                    <small>SUGGESTED TEMPLATE</small>
                    <strong>{selectedTheme.template.title}</strong>
                    <p>{selectedTheme.template.sections.join(" · ")}</p>
                  </div>
                  <button type="button" onClick={applyThemeTemplate}>
                    <Sparkles size={13} /> Use template
                  </button>
                </div>
              </div>
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
              <section className="meaningAnalyzer" aria-live="polite">
                <header>
                  <span><Sparkles size={16} /></span>
                  <div>
                    <strong>Meaningfulness AI</strong>
                    <small>Private on-device analysis</small>
                  </div>
                  <StarRating value={draftAnalysis.stars} />
                </header>
                <p>{draftAnalysis.feedback}</p>
                <div className="analysisCriteria">
                  {Object.entries(draftAnalysis.criteria).map(([name, value]) => (
                    <div key={name}>
                      <span>{name}</span>
                      <i><b style={{ width: `${Math.round((value / 2) * 100)}%` }} /></i>
                    </div>
                  ))}
                </div>
                <small className="analyzerPrivacy">
                  Your draft stays in this browser. Likes and popularity do not affect these stars.
                </small>
              </section>
              <div className="mediaComposer">
                <div className="mediaComposerHead">
                  <div>
                    <strong>Add your event photo</strong>
                    <span>Recommended</span>
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
                    <span><ImagePlus size={15} /> {mediaPreparing ? "Compressing…" : "Add photo"}</span>
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
              <button
                className="publishButton"
                disabled={storyPublishing || mediaPreparing}
              >
                {storyPublishing ? "Publishing…" : "Submit event entry ↗"}
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
              className="modalClose modalBack"
              type="button"
              onClick={() => setProfileOpen(false)}
              aria-label="Back from profile editor"
            >
              <ArrowLeft size={14} /> <span>Back</span>
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
                Location
                <input
                  maxLength={80}
                  value={profileDraft.location}
                  onChange={(event) =>
                    setProfileDraft({
                      ...profileDraft,
                      location: event.target.value,
                    })
                  }
                  placeholder="City or country"
                />
              </label>
              <label>
                Website
                <input
                  type="url"
                  maxLength={300}
                  value={profileDraft.website}
                  onChange={(event) =>
                    setProfileDraft({
                      ...profileDraft,
                      website: event.target.value,
                    })
                  }
                  placeholder="https://your-portfolio.com"
                />
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
            <AchievementPanel achievements={achievements} />
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
              className="modalClose modalBack"
              type="button"
              onClick={() => setPostToDelete(null)}
              aria-label="Back from delete story confirmation"
              disabled={postDeleting}
            >
              <ArrowLeft size={14} /> <span>Back</span>
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
              className="modalClose modalBack"
              type="button"
              onClick={() => setAccountDeleteOpen(false)}
              aria-label="Back from delete account confirmation"
              disabled={accountDeleting}
            >
              <ArrowLeft size={14} /> <span>Back</span>
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
          <section
            className={`socialPanel ${socialTarget === "chat" ? "chatFocus" : "directoryFocus"}`}
            role="dialog"
            aria-modal="true"
          >
            {!activeChat && (
              <button
                className="modalClose modalBack"
                type="button"
                onClick={() => {
                  setSocialOpen(false);
                  setActiveChat(null);
                }}
                aria-label="Back from community panel"
              >
                <ArrowLeft size={14} /> <span>Back</span>
              </button>
            )}
            <div className="socialSidebar">
              <p className="eyebrow">YOUR COMMUNITY</p>
              <h2>
                {socialTarget === "followers"
                  ? "Followers"
                  : socialTarget === "requests"
                    ? "Follow requests"
                    : socialTarget === "following"
                      ? "Following"
                      : "Discover people"}
              </h2>

              {socialTarget === "people" && (
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
                  <div className="profileSummaryActions">
                    <button onClick={openProfileEditor}>Edit profile</button>
                    <button className="profileLogout" onClick={logout}>Log out</button>
                  </div>
                </div>
              )}

              {socialTarget === "requests" && (
                <div className="requestSection" id="follow-requests">
                  <h3><Inbox size={14} /> Pending requests</h3>
                  {incomingRequests.length ? incomingRequests.map((request) => {
                    const person = people.find((item) => item.uid === request.from);
                    if (!person) return null;
                    return (
                      <div className="personRow" key={request.id}>
                        <ProfileAvatar person={person} tone="peach" />
                        <div className="personName">
                          <strong>{person.displayName}</strong>
                          <small>{person.username ? `@${person.username}` : "Softly writer"}</small>
                        </div>
                        <div className="requestActions">
                          <button
                            className="acceptRequest"
                            onClick={() => answerRequest(request, true)}
                            aria-label={`Accept ${person.displayName}'s follow request`}
                          >
                            <UserCheck size={14} /> <span>Accept</span>
                          </button>
                          <button
                            className="declineRequest"
                            onClick={() => answerRequest(request, false)}
                            aria-label={`Decline ${person.displayName}'s follow request`}
                          >
                            <X size={14} /> <span>Decline</span>
                          </button>
                        </div>
                      </div>
                    );
                  }) : (
                    <p className="directoryEmpty">No pending follow requests.</p>
                  )}
                </div>
              )}

              {(socialTarget === "followers" || socialTarget === "following") && (
                <div className="peopleSection communityPeopleList">
                  <h3>
                    {socialTarget === "followers" ? (
                      <><UserPlus size={14} /> People following you</>
                    ) : (
                      <><UserCheck size={14} /> People you follow</>
                    )}
                  </h3>
                  {(socialTarget === "followers" ? followers : following).length ? (
                    (socialTarget === "followers" ? followers : following).map((person) => (
                      <div className="personRow" key={person.uid}>
                        <ProfileAvatar person={person} tone="sage" />
                        <div className="personName">
                          <strong>{person.displayName}</strong>
                          <small>{person.username ? `@${person.username}` : "Softly writer"}</small>
                        </div>
                        <button
                          className="personAction connected"
                          type="button"
                          onClick={() => openConversation(person)}
                        >
                          <MessageCircle size={13} /> Chat
                        </button>
                      </div>
                    ))
                  ) : (
                    <p className="directoryEmpty">
                      {socialTarget === "followers"
                        ? "No followers yet."
                        : "You are not following anyone yet."}
                    </p>
                  )}
                </div>
              )}

              {socialTarget === "people" && (
                <div className="peopleSection" id="people-directory">
                  <h3><UserPlus size={14} /> {peopleSearch ? "Search results" : "Suggested people"}</h3>
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
                              {person.username ? `@${person.username}` : "No username yet"}
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
                            <button className="personAction connected" type="button" onClick={() => openConversation(person)}>
                              <MessageCircle size={13} /> Chat
                            </button>
                          ) : status === "none" ? (
                            <button className="personAction" onClick={() => requestFollow(person)}>
                              <UserPlus size={13} /> Follow
                            </button>
                          ) : status === "incoming" ? (
                            <button
                              className="personAction"
                              onClick={() => {
                                const request = incoming.find((item) => item.from === person.uid);
                                if (request) answerRequest(request, true);
                              }}
                            >
                              <UserCheck size={13} /> Accept
                            </button>
                          ) : (
                            <button className="personAction muted" disabled>
                              <Clock3 size={13} /> Pending
                            </button>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <p className="directoryEmpty">
                      {peopleSearch ? "No matching people found." : "More people will appear here after they join."}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="chatArea">
              {activeChat ? (
                <>
                  <header className="chatHeader">
                    <button
                      className="chatBackButton"
                      type="button"
                      onClick={() => setActiveChat(null)}
                      aria-label="Back to messages"
                    >
                      <ArrowLeft size={15} /> <span>Back</span>
                    </button>
                    <ProfileAvatar person={activeChat} tone="sky" />
                    <div className="chatIdentity">
                      <strong>{activeChat.displayName}</strong>
                      <small>PRIVATE CONVERSATION</small>
                    </div>
                    <div className="chatCallActions">
                      <button
                        className="audioCallButton"
                        type="button"
                        onClick={startAudioCall}
                        disabled={Boolean(callStarting)}
                        aria-label="Start audio call"
                      >
                        <span aria-hidden="true">☎</span>
                        {callStarting === "audio" ? "Starting…" : "Audio"}
                      </button>
                      <button
                        className="videoCallButton"
                        type="button"
                        onClick={startVideoCall}
                        disabled={Boolean(callStarting)}
                        aria-label="Start video call"
                      >
                        <span aria-hidden="true">◉</span>
                        {callStarting === "video" ? "Starting…" : "Video"}
                      </button>
                    </div>
                    <button
                      className="removeConnection"
                      onClick={() => removeFollow(activeChat)}
                    >
                      Remove
                    </button>
                  </header>
                  <div
                    className="messageList"
                    ref={messageListRef}
                    role="log"
                    aria-live="polite"
                    aria-label={`Conversation with ${activeChat.displayName}`}
                  >
                    {messages.length ? (
                      messages.map((item) => {
                        const isCall =
                          ["video_call", "audio_call"].includes(item.messageType) &&
                          item.callRoom;
                        const isMine = item.senderId === user.uid;
                        const callType =
                          item.messageType === "audio_call" ? "audio" : "video";
                        let messageContent;
                        if (isCall) {
                          messageContent = (
                            <article className={`callInvitation ${isMine ? "mine" : ""}`}>
                              <div className="callInvitationIcon" aria-hidden="true">
                                {callType === "audio" ? "☎" : "◉"}
                              </div>
                              <div>
                                <small>
                                  {isMine
                                    ? "YOU STARTED A CALL"
                                    : `${callType.toUpperCase()} CALL INVITATION`}
                                </small>
                                <strong>
                                  {isMine
                                    ? `Waiting for ${activeChat.displayName}`
                                    : `${activeChat.displayName} invited you`}
                                </strong>
                                <p>
                                  {callType === "audio"
                                    ? "Your camera starts off. Microphone permission is requested when you join."
                                    : "Camera and microphone permissions are requested after you join."}
                                </p>
                                <a
                                  href={callURL(item.callRoom, callType)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  Join {callType} call ↗
                                </a>
                              </div>
                            </article>
                          );
                        } else if (item.messageType === "photo" && item.mediaURL) {
                          messageContent = (
                            <article className={`chatMediaCard ${isMine ? "mine" : ""}`}>
                              <img src={item.mediaURL} alt="Shared in chat" />
                              <span>Shared photo</span>
                            </article>
                          );
                        } else if (item.messageType === "video" && item.mediaURL) {
                          const details = getVideoDetails(item.mediaURL);
                          messageContent = (
                            <article
                              className={`chatMediaCard chatVideoCard ${isMine ? "mine" : ""}`}
                            >
                              {details ? (
                                <StoryVideo details={details} title="Shared video" />
                              ) : (
                                <a href={item.mediaURL} target="_blank" rel="noopener noreferrer">
                                  Open shared video ↗
                                </a>
                              )}
                              <span>Shared video</span>
                            </article>
                          );
                        } else if (item.messageType === "link" && item.mediaURL) {
                          messageContent = (
                            <a
                              className={`chatLinkCard ${isMine ? "mine" : ""}`}
                              href={item.mediaURL}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <small>SHARED LINK</small>
                              <strong>{linkHost(item.mediaURL)}</strong>
                              <span>{item.mediaURL}</span>
                            </a>
                          );
                        } else {
                          messageContent = (
                            <div className={`messageBubble ${isMine ? "mine" : ""}`}>
                              <span>{item.text}</span>
                              {item.editedAt && <small className="messageEdited">edited</small>}
                            </div>
                          );
                        }

                        return (
                          <div className={`chatMessageRow ${isMine ? "mine" : ""}`} key={item.id}>
                            {messageContent}
                            {isMine && (
                              <div className="messageActions" aria-label="Message actions">
                                {item.messageType === "text" && (
                                  <button
                                    type="button"
                                    onClick={() => beginMessageEdit(item)}
                                    disabled={messageActionBusy === item.id}
                                    aria-label="Edit message"
                                    title="Edit message"
                                  >
                                    <Pencil size={13} /> <span>Edit</span>
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => deleteMessage(item)}
                                  disabled={messageActionBusy === item.id}
                                  aria-label="Delete message"
                                  title="Delete message"
                                >
                                  <Trash2 size={13} /> <span>Delete</span>
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      <p className="chatEmpty">
                        You’re connected. Say something thoughtful.
                      </p>
                   )}
                  </div>
                  {attachmentOpen && (
                    <form className="chatSharePanel" onSubmit={sendChatAttachment}>
                      <div className="chatShareTabs">
                        {["link", "photo", "video"].map((type) => (
                          <button
                            type="button"
                            key={type}
                            className={chatAttachment.type === type ? "active" : ""}
                            onClick={() => setChatAttachment({ type, url: "" })}
                          >
                            {type === "link" ? (
                              <><Link2 size={14} /> Link</>
                            ) : type === "photo" ? (
                              <><ImagePlus size={14} /> Photo</>
                            ) : (
                              <><Video size={14} /> Video</>
                            )}
                          </button>
                        ))}
                      </div>
                      {chatAttachment.type === "photo" ? (
                        <div className="chatPhotoPicker">
                          {chatAttachment.url ? (
                            <img src={chatAttachment.url} alt="Ready to share" />
                          ) : (
                            <span>Choose a photo up to 15 MB</span>
                          )}
                          <label>
                            {attachmentPreparing ? "Preparing…" : "Choose photo"}
                            <input
                              type="file"
                              accept="image/*"
                              onChange={chooseChatPhoto}
                              disabled={attachmentPreparing}
                            />
                          </label>
                        </div>
                      ) : (
                        <label className="chatURLField">
                          {chatAttachment.type === "video"
                            ? "Paste a YouTube, Vimeo, Drive or direct video link"
                            : "Paste a secure website link"}
                          <input
                            type="url"
                            value={chatAttachment.url}
                            onChange={(event) =>
                              setChatAttachment((current) => ({
                                ...current,
                                url: event.target.value,
                              }))
                            }
                            placeholder="https://…"
                            required
                          />
                        </label>
                      )}
                      <div className="chatShareActions">
                        <button type="button" onClick={() => setAttachmentOpen(false)}>
                          Cancel
                        </button>
                        <button
                          className="primaryAction"
                          disabled={attachmentPreparing || !chatAttachment.url}
                        >
                          Share <Send size={14} />
                        </button>
                      </div>
                    </form>
                  )}
                  {editingMessage && (
                    <div className="messageEditBanner" role="status">
                      <Pencil size={14} />
                      <span>
                        <strong>Editing message</strong>
                        <small>Update the text, then tap Save.</small>
                      </span>
                      <button type="button" onClick={cancelMessageEdit}>
                        Cancel
                      </button>
                    </div>
                  )}
                  <form className="messageForm" onSubmit={sendMessage}>
                    <button
                      className="attachmentToggle"
                      type="button"
                      onClick={() => setAttachmentOpen((current) => !current)}
                      disabled={Boolean(editingMessage)}
                      aria-label="Share link, photo or video"
                      title="Share link, photo or video"
                    >
                      <Paperclip size={18} />
                    </button>
                    <input
                      value={message}
                      onChange={(event) => setMessage(event.target.value)}
                      maxLength={1000}
                      placeholder={editingMessage ? "Edit your message…" : "Write a message…"}
                    />
                    <button
                      className="messageSendButton"
                      disabled={!cleanText(message, 1000) || Boolean(messageActionBusy)}
                    >
                      {editingMessage ? "Save" : "Send"} <Send size={15} />
                    </button>
                  </form>
                </>
              ) : (
                <section className="chatInbox" aria-label="Messages inbox">
                  <header className="chatInboxHeader">
                    <div>
                      <span>PRIVATE MESSAGES</span>
                      <h3>Messages</h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSocialTarget("people")}
                      aria-label="Find someone to message"
                    >
                      <UserPlus size={16} /> <span>New</span>
                    </button>
                  </header>

                  <nav className="chatInboxTabs" aria-label="Message folders">
                    <button
                      className="active"
                      type="button"
                      onClick={() => {
                        setChatSearch("");
                        setActiveChat(null);
                      }}
                    >
                      All
                    </button>
                    <button type="button" onClick={() => setSocialTarget("requests")}>
                      Requests
                      {incomingRequests.length > 0 && <b>{incomingRequests.length}</b>}
                    </button>
                    <button type="button" onClick={() => setSocialTarget("people")}>
                      Find people
                    </button>
                  </nav>

                  <label className="chatInboxSearch">
                    <SearchIcon size={17} aria-hidden="true" />
                    <input
                      value={chatSearch}
                      onChange={(event) => setChatSearch(event.target.value)}
                      placeholder="Search conversations"
                      aria-label="Search conversations"
                    />
                  </label>

                  <div className="chatThreadList">
                    {chatThreads.length ? (
                      chatThreads.map((person) => (
                        <button
                          className="chatThread"
                          type="button"
                          key={person.uid}
                          onClick={() => openConversation(person)}
                        >
                          <ProfileAvatar person={person} tone="sky" />
                          <span className="chatThreadCopy">
                            <strong>{person.displayName}</strong>
                            <small>{person.preview}</small>
                          </span>
                          <span className="chatThreadMeta">
                            <time>{relativeChatTime(person.latestMessage?.createdAt)}</time>
                            {person.unread > 0 && (
                              <b aria-label={`${person.unread} unread messages`}>
                                {person.unread > 9 ? "9+" : person.unread}
                              </b>
                            )}
                          </span>
                        </button>
                      ))
                    ) : (
                      <div className="chatInboxEmpty">
                        <MessageCircle size={28} />
                        <strong>{chatSearch ? "No conversations found" : "Your inbox is ready"}</strong>
                        <p>
                          {chatSearch
                            ? "Try another name or username."
                            : "Connect with someone, then start a private conversation here."}
                        </p>
                        {!chatSearch && (
                          <button type="button" onClick={() => setSocialTarget("people")}>
                            Find people
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </section>
              )}
            </div>
          </section>
        </div>
      )}

      <AnimatePresence>
        {deletedMessage && (
          <m.div
            className="messageUndoBar"
            role="status"
            aria-live="polite"
            initial={reduceMotion ? false : { opacity: 0, y: 12, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: 10, x: "-50%" }}
          >
            <span>Message deleted</span>
            <button
              type="button"
              onClick={undoDeleteMessage}
              disabled={Boolean(messageActionBusy)}
            >
              <Undo2 size={14} /> Undo
            </button>
          </m.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {notice && (
          <m.div
            className="toast"
            role="status"
            aria-live="polite"
            initial={reduceMotion ? false : { opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.98 }}
          >
            ✓ {notice}
          </m.div>
        )}
      </AnimatePresence>
    </main>
    </>
  );
}
