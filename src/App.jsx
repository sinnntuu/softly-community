import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import {
  getRedirectResult,
  onAuthStateChanged,
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

export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [posts, setPosts] = useState([]);
  const [likes, setLikes] = useState([]);
  const [people, setPeople] = useState([]);
  const [outgoing, setOutgoing] = useState([]);
  const [incoming, setIncoming] = useState([]);
  const [messages, setMessages] = useState([]);
  const [category, setCategory] = useState("All stories");
  const [search, setSearch] = useState("");
  const [composerOpen, setComposerOpen] = useState(false);
  const [socialOpen, setSocialOpen] = useState(false);
  const [activeChat, setActiveChat] = useState(null);
  const [message, setMessage] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [notice, setNotice] = useState("");
  const [draft, setDraft] = useState({
    title: "",
    excerpt: "",
    body: "",
    category: "Life",
  });

  useEffect(() => {
    if (!firebaseReady || !auth) {
      setAuthLoading(false);
      return;
    }
    getRedirectResult(auth).catch(() => {});
    return onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      setAuthLoading(false);
      if (nextUser && db) {
        await setDoc(
          doc(db, "users", nextUser.uid),
          {
            displayName: nextUser.displayName || "Softly writer",
            email: nextUser.email || "",
            photoURL: nextUser.photoURL || "",
            joinedAt: serverTimestamp(),
          },
          { merge: true },
        );
      }
    });
  }, []);

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

  const incomingRequests = incoming.filter(
    (item) => item.status === "pending",
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

  const publish = async (event) => {
    event.preventDefault();
    if (!user || !db) return;
    await addDoc(collection(db, "posts"), {
      ...draft,
      authorId: user.uid,
      authorName: user.displayName || "Softly writer",
      authorPhoto: user.photoURL || "",
      createdAt: serverTimestamp(),
    });
    setDraft({ title: "", excerpt: "", body: "", category: "Life" });
    setComposerOpen(false);
    setNotice("Your story is live.");
    window.setTimeout(() => setNotice(""), 3500);
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

  const requestFollow = async (person) => {
    if (!user || !db) return;
    await setDoc(doc(db, "follows", `${user.uid}_${person.uid}`), {
      from: user.uid,
      to: person.uid,
      fromName: user.displayName || "Softly writer",
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
    if (!text || !user || !activeChat || !db) return;
    await addDoc(collection(db, "messages"), {
      chatId: chatId(user.uid, activeChat.uid),
      senderId: user.uid,
      receiverId: activeChat.uid,
      participants: [user.uid, activeChat.uid],
      text: text.slice(0, 1000),
      createdAt: serverTimestamp(),
    });
    setMessage("");
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
              <span className="avatar sage">
                {initials(user.displayName || "")}
              </span>
              <span className="accountName">{user.displayName}</span>
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
              return (
                <article className="storyCard" key={post.id}>
                  <div className={`storyArt ${tones[index % 3]}`}>
                    <span className="storyNumber">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div className="artShape" />
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
                      <p className="fullStory">{post.body}</p>
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
                      <span className={`avatar ${tones[index % 3]}`}>
                        {initials(post.authorName)}
                      </span>
                      <div>
                        <strong>{post.authorName}</strong>
                        <small>COMMUNITY WRITER</small>
                      </div>
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
              <button className="publishButton">Publish story ↗</button>
            </form>
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
                        <span className="avatar peach">
                          {initials(person.displayName)}
                        </span>
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
                {people.length ? (
                  people.map((person) => {
                    const status = relationship(person);
                    return (
                      <div className="personRow" key={person.uid}>
                        <span className="avatar sage">
                          {initials(person.displayName)}
                        </span>
                        <div className="personName">
                          <strong>{person.displayName}</strong>
                          <small>
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
                    More people will appear here after they join.
                  </p>
                )}
              </div>
            </div>

            <div className="chatArea">
              {activeChat ? (
                <>
                  <header className="chatHeader">
                    <span className="avatar sky">
                      {initials(activeChat.displayName)}
                    </span>
                    <div>
                      <strong>{activeChat.displayName}</strong>
                      <small>PRIVATE CONVERSATION</small>
                    </div>
                    <button
                      className="removeConnection"
                      onClick={() => removeFollow(activeChat)}
                    >
                      Remove
                    </button>
                  </header>
                  <div className="messageList">
                    {messages.length ? (
                      messages.map((item) => (
                        <div
                          className={`messageBubble ${
                            item.senderId === user.uid ? "mine" : ""
                          }`}
                          key={item.id}
                        >
                          {item.text}
                        </div>
                      ))
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
