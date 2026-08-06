import { useEffect, useMemo, useState } from "react";
import { m } from "framer-motion";
import {
  CheckCircle2,
  Copy,
  Crown,
  Download,
  History,
  ImagePlus,
  Lock,
  LogIn,
  Plus,
  Sparkles,
  Trash2,
  UsersRound,
  X,
} from "lucide-react";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { cleanText, escapeHTML, safeFileName } from "../lib/text";

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function createRoomCode() {
  const bytes = new Uint8Array(6);
  globalThis.crypto?.getRandomValues?.(bytes);
  return Array.from(
    bytes,
    (value, index) =>
      ROOM_CODE_ALPHABET[
        globalThis.crypto?.getRandomValues
          ? value % ROOM_CODE_ALPHABET.length
          : (Date.now() + index * 17) % ROOM_CODE_ALPHABET.length
      ],
  ).join("");
}

function timeValue(value) {
  return value?.toMillis?.() ?? 0;
}

function RoomAvatar({ name, photoURL }) {
  const letters = (name || "Softly writer")
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  return (
    <span className={`roomAvatar ${photoURL ? "hasPhoto" : ""}`} aria-hidden="true">
      {photoURL ? <img src={photoURL} alt="" referrerPolicy="no-referrer" /> : letters}
    </span>
  );
}

function ScorePill({ score }) {
  return (
    <span className="roomScore" aria-label={`${score} meaningfulness stars out of 10`}>
      <Sparkles size={13} /> {score}/10
    </span>
  );
}

export default function RoomHub({
  db,
  user,
  profile,
  themeOptions,
  analyzeThought,
  preparePhoto,
  onClose,
  onNotice,
}) {
  const storageKey = `softly-room-${user.uid}`;
  const [activeCode, setActiveCode] = useState(() => {
    try {
      return localStorage.getItem(storageKey) || "";
    } catch {
      return "";
    }
  });
  const [room, setRoom] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [roomHistory, setRoomHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [loading, setLoading] = useState(Boolean(activeCode));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [joinTheme, setJoinTheme] = useState("Student Innovation");
  const [entryTheme, setEntryTheme] = useState("Student Innovation");
  const [createDraft, setCreateDraft] = useState({ title: "" });
  const [entryDraft, setEntryDraft] = useState({
    title: "",
    thought: "",
    imageURL: "",
  });
  const [imagePreparing, setImagePreparing] = useState(false);

  const displayName = profile?.displayName || user.displayName || "Softly writer";
  const profilePhoto = profile?.photoURL || user.photoURL || "";

  useEffect(() => {
    const historyQuery = query(
      collection(db, "roomHistory", user.uid, "rooms"),
      orderBy("lastOpenedAt", "desc"),
    );
    return onSnapshot(
      historyQuery,
      (snapshot) => {
        setRoomHistory(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
        setHistoryLoading(false);
      },
      () => {
        setRoomHistory([]);
        setHistoryLoading(false);
      },
    );
  }, [db, user.uid]);

  useEffect(() => {
    if (!activeCode) {
      setRoom(null);
      setParticipants([]);
      setSubmissions([]);
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    setError("");
    const roomRef = doc(db, "rooms", activeCode);
    const participantQuery = query(
      collection(db, "rooms", activeCode, "participants"),
      orderBy("joinedAt", "asc"),
    );
    const submissionQuery = query(
      collection(db, "rooms", activeCode, "submissions"),
      orderBy("createdAt", "asc"),
    );

    const stopRoom = onSnapshot(
      roomRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          setError("This room no longer exists.");
          setRoom(null);
        } else {
          setRoom({ id: snapshot.id, ...snapshot.data() });
        }
        setLoading(false);
      },
      () => {
        setError("Room could not be loaded. Check the code and try again.");
        setLoading(false);
      },
    );
    const stopParticipants = onSnapshot(
      participantQuery,
      (snapshot) =>
        setParticipants(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
      () => setError("Participant updates could not be loaded."),
    );
    const stopSubmissions = onSnapshot(
      submissionQuery,
      (snapshot) =>
        setSubmissions(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
      () => setError("Submissions could not be loaded."),
    );

    return () => {
      stopRoom();
      stopParticipants();
      stopSubmissions();
    };
  }, [activeCode, db]);

  const ownSubmission = submissions.find((item) => item.userId === user.uid);
  const activeParticipant = participants.find((item) => item.userId === user.uid);

  useEffect(() => {
    if (!ownSubmission) return;
    setEntryDraft({
      title: ownSubmission.title || "",
      thought: ownSubmission.thought || "",
      imageURL: ownSubmission.imageURL || "",
    });
  }, [ownSubmission?.id, ownSubmission?.updatedAt]);

  useEffect(() => {
    const savedTheme = ownSubmission?.theme || activeParticipant?.theme || room?.theme;
    if (themeOptions.some((item) => item.name === savedTheme)) {
      setEntryTheme(savedTheme);
    }
  }, [activeParticipant?.theme, ownSubmission?.theme, room?.theme, themeOptions]);

  useEffect(() => {
    if (!room?.id || !activeCode) return;
    setDoc(
      doc(db, "roomHistory", user.uid, "rooms", activeCode),
      {
        roomId: activeCode,
        title: room.title,
        role: room.hostId === user.uid ? "host" : "participant",
        status: room.status,
        hostName: room.hostName,
        savedAt: activeParticipant?.joinedAt || room.createdAt || serverTimestamp(),
        lastOpenedAt: serverTimestamp(),
      },
      { merge: true },
    ).catch(() => {
      // Room access still works if history sync is temporarily unavailable.
    });
  }, [activeCode, activeParticipant?.joinedAt, db, room?.hostId, room?.hostName, room?.id, room?.status, room?.title, room?.createdAt, user.uid]);

  const ranking = useMemo(
    () =>
      submissions
        .map((submission) => {
          const analysis = analyzeThought({
            title: submission.title,
            excerpt: submission.thought.slice(0, 240),
            body: submission.thought,
            theme: submission.theme || room?.theme || "Student Innovation",
          });
          return { ...submission, analysis, score: analysis.stars };
        })
        .sort(
          (a, b) =>
            b.score - a.score ||
            b.thought.length - a.thought.length ||
            timeValue(a.createdAt) - timeValue(b.createdAt),
        ),
    [analyzeThought, room?.theme, submissions],
  );

  const selectedTheme = themeOptions.find((item) => item.name === entryTheme);
  const joinThemeDefinition = themeOptions.find((item) => item.name === joinTheme);
  const allSubmitted =
    participants.length >= 2 && submissions.length === participants.length;
  const isHost = room?.hostId === user.uid;
  const isComplete = room?.status === "complete";
  const isClosed = room?.status === "closed";
  const canFinalize =
    !isComplete &&
    ranking.length >= 2 &&
    ((room?.status === "open" && allSubmitted) || room?.status === "closed");

  const saveActiveCode = (code) => {
    setActiveCode(code);
    try {
      localStorage.setItem(storageKey, code);
    } catch {
      // The live room still works when private browsing blocks storage.
    }
  };

  const saveHistoryEntry = (code, roomData, role) =>
    setDoc(
      doc(db, "roomHistory", user.uid, "rooms", code),
      {
        roomId: code,
        title: roomData.title,
        role,
        status: roomData.status || "open",
        hostName: roomData.hostName,
        savedAt: serverTimestamp(),
        lastOpenedAt: serverTimestamp(),
      },
      { merge: true },
    );

  const leaveRoomView = () => {
    setActiveCode("");
    setRoom(null);
    setError("");
    setEntryDraft({ title: "", thought: "", imageURL: "" });
    setEntryTheme("Student Innovation");
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // No action required when storage is unavailable.
    }
  };

  const createRoom = async (event) => {
    event.preventDefault();
    const title = cleanText(createDraft.title, 80);
    if (title.length < 5) {
      setError("Give the room a clear title of at least 5 characters.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      let code = "";
      for (let attempt = 0; attempt < 6 && !code; attempt += 1) {
        const candidate = createRoomCode();
        const roomRef = doc(db, "rooms", candidate);
        try {
          await runTransaction(db, async (transaction) => {
            const existing = await transaction.get(roomRef);
            if (existing.exists()) throw new Error("ROOM_CODE_TAKEN");
            transaction.set(roomRef, {
              code: candidate,
              title,
              hostId: user.uid,
              hostName: displayName,
              status: "open",
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          });
          code = candidate;
        } catch (roomError) {
          if (roomError.message !== "ROOM_CODE_TAKEN") throw roomError;
        }
      }
      if (!code) throw new Error("A room code could not be generated. Try again.");

      await setDoc(doc(db, "rooms", code, "participants", user.uid), {
        roomId: code,
        userId: user.uid,
        displayName,
        photoURL: profilePhoto,
        theme: "Student Innovation",
        joinedAt: serverTimestamp(),
      });
      await saveHistoryEntry(
        code,
        { title, hostName: displayName, status: "open" },
        "host",
      );
      saveActiveCode(code);
      onNotice(`Room ${code} is ready. Share the code with participants.`);
    } catch (roomError) {
      setError(roomError.message || "The room could not be created.");
    } finally {
      setBusy(false);
    }
  };

  const joinRoom = async (event) => {
    event.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) {
      setError("Enter the 6-character room code.");
      return;
    }
    if (!themeOptions.some((item) => item.name === joinTheme)) {
      setError("Choose one of the available themes.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const roomRef = doc(db, "rooms", code);
      const participantRef = doc(db, "rooms", code, "participants", user.uid);
      const [roomSnapshot, participantSnapshot] = await Promise.all([
        getDoc(roomRef),
        getDoc(participantRef),
      ]);
      if (!roomSnapshot.exists()) throw new Error("No room was found for that code.");
      if (!participantSnapshot.exists()) {
        if (roomSnapshot.data().status !== "open") {
          throw new Error("This room has already finished judging.");
        }
        await setDoc(participantRef, {
          roomId: code,
          userId: user.uid,
          displayName,
          photoURL: profilePhoto,
          theme: joinTheme,
          joinedAt: serverTimestamp(),
        });
      }
      await saveHistoryEntry(code, roomSnapshot.data(), roomSnapshot.data().hostId === user.uid ? "host" : "participant");
      setEntryTheme(participantSnapshot.data()?.theme || joinTheme);
      saveActiveCode(code);
      onNotice(`Joined room ${code} with the ${participantSnapshot.data()?.theme || joinTheme} theme.`);
    } catch (roomError) {
      setError(roomError.message || "The room could not be joined.");
    } finally {
      setBusy(false);
    }
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(activeCode);
      onNotice("Room code copied.");
    } catch {
      onNotice(`Room code: ${activeCode}`);
    }
  };

  const chooseImage = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImagePreparing(true);
    setError("");
    try {
      const imageURL = await preparePhoto(file);
      setEntryDraft((current) => ({ ...current, imageURL }));
    } catch (imageError) {
      setError(imageError.message || "The picture could not be prepared.");
    } finally {
      setImagePreparing(false);
      event.target.value = "";
    }
  };

  const submitThought = async (event) => {
    event.preventDefault();
    const title = cleanText(entryDraft.title, 100);
    const thought = cleanText(entryDraft.thought, 3000);
    if (title.length < 5) {
      setError("Add a title of at least 5 characters.");
      return;
    }
    if (thought.length < 80) {
      setError("Share at least 80 characters so the analysis has enough context.");
      return;
    }
    if (!entryDraft.imageURL) {
      setError("Add one original picture with your thought.");
      return;
    }
    if (room?.status !== "open") {
      setError("Entries are closed for this room.");
      return;
    }
    if (!themeOptions.some((item) => item.name === entryTheme)) {
      setError("Choose one of the available themes.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const analysis = analyzeThought({
        title,
        excerpt: thought.slice(0, 240),
        body: thought,
        theme: entryTheme,
      });
      await setDoc(
        doc(db, "rooms", activeCode, "participants", user.uid),
        { theme: entryTheme },
        { merge: true },
      );
      await setDoc(doc(db, "rooms", activeCode, "submissions", user.uid), {
        roomId: activeCode,
        userId: user.uid,
        displayName,
        profilePhoto,
        title,
        thought,
        imageURL: entryDraft.imageURL,
        theme: entryTheme,
        score: analysis.stars,
        feedback: analysis.feedback,
        createdAt: ownSubmission?.createdAt || serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      onNotice(ownSubmission ? "Your room entry was updated." : "Your room entry was submitted.");
    } catch (submissionError) {
      setError(submissionError.message || "Your entry could not be submitted.");
    } finally {
      setBusy(false);
    }
  };

  const closeRoom = async () => {
    if (!isHost || room?.status !== "open") return;
    if (!window.confirm("Close this room? New participants and entry changes will stop.")) return;
    setBusy(true);
    setError("");
    try {
      await updateDoc(doc(db, "rooms", activeCode), {
        status: "closed",
        closedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      onNotice("Room closed. The submitted entries are locked.");
    } catch (roomError) {
      setError(roomError.message || "The room could not be closed.");
    } finally {
      setBusy(false);
    }
  };

  const deleteRoom = async () => {
    if (!isHost) return;
    if (!window.confirm("Permanently delete this room and every entry? This cannot be undone.")) return;
    setBusy(true);
    setError("");
    try {
      const childRefs = [
        ...participants.map((item) =>
          doc(db, "rooms", activeCode, "participants", item.id),
        ),
        ...submissions.map((item) =>
          doc(db, "rooms", activeCode, "submissions", item.id),
        ),
        ...participants.map((item) =>
          doc(db, "roomHistory", item.userId, "rooms", activeCode),
        ),
      ];
      for (let start = 0; start < childRefs.length; start += 400) {
        const batch = writeBatch(db);
        childRefs.slice(start, start + 400).forEach((itemRef) => batch.delete(itemRef));
        await batch.commit();
      }
      await deleteDoc(doc(db, "rooms", activeCode));
      leaveRoomView();
      onNotice("Room and all of its entries were deleted.");
    } catch (roomError) {
      setError(roomError.message || "The room could not be deleted.");
    } finally {
      setBusy(false);
    }
  };

  const finalizeRoom = async () => {
    if (!isHost || !canFinalize || !ranking.length) return;
    setBusy(true);
    setError("");
    try {
      const winner = ranking[0];
      await updateDoc(doc(db, "rooms", activeCode), {
        status: "complete",
        winnerId: winner.userId,
        winnerName: winner.displayName,
        winnerScore: winner.score,
        judgedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      onNotice(`${winner.displayName} is the room winner.`);
    } catch (roomError) {
      setError(roomError.message || "The results could not be finalized.");
    } finally {
      setBusy(false);
    }
  };

  const downloadResults = () => {
    if (!isComplete || !ranking.length) return;
    const cards = ranking
      .map(
        (entry, index) => `
          <article class="entry ${index === 0 ? "winner" : ""}">
            <div class="rank">${index + 1}</div>
            <img src="${entry.imageURL}" alt="Picture shared by ${escapeHTML(entry.displayName)}">
            <div class="copy">
              <small>${escapeHTML(entry.theme || room.theme || "Student Innovation")}</small>
              <h2>${escapeHTML(entry.title)}</h2>
              <p class="author">${escapeHTML(entry.displayName)} · ★ ${entry.score}/10</p>
              <p>${escapeHTML(entry.thought).replace(/\n/g, "<br>")}</p>
              <strong>${escapeHTML(entry.analysis.feedback)}</strong>
            </div>
          </article>`,
      )
      .join("");
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHTML(room.title)} results</title><style>body{margin:0;background:#e9e7df;color:#20241f;font-family:Arial,sans-serif}.page{max-width:900px;margin:auto;padding:42px 20px}.brand{font:700 28px Georgia,serif}.brand i,.eyebrow{color:#a54836}.eyebrow{margin-top:42px;font-size:11px;font-weight:800;letter-spacing:.16em}h1{margin:12px 0;font:500 48px/1 Georgia,serif}.summary{color:#575c56}.entry{display:grid;grid-template-columns:48px 220px 1fr;gap:20px;margin-top:24px;padding:20px;border-radius:24px;background:#e9e7df;box-shadow:10px 10px 24px #c1c0b8,-10px -10px 24px #fff}.entry.winner{outline:2px solid #a54836}.rank{font:700 28px Georgia,serif;color:#a54836}.entry img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:18px}.entry h2{margin:7px 0;font:600 25px Georgia,serif}.entry small{color:#a54836;font-weight:700}.entry p{color:#575c56;line-height:1.6}.entry .author{color:#20241f;font-weight:700}.entry strong{color:#a54836;font-size:12px}.footer{margin-top:40px;color:#575c56;font-size:11px}@media(max-width:650px){h1{font-size:38px}.entry{grid-template-columns:34px 1fr}.entry img{grid-column:2}.copy{grid-column:2}}</style></head><body><main class="page"><div class="brand">softly<i>.</i></div><p class="eyebrow">ROOM ${escapeHTML(activeCode)} · FINAL RESULTS</p><h1>${escapeHTML(room.title)}</h1><p class="summary">${ranking.length} participants · Winner: <strong>${escapeHTML(ranking[0].displayName)}</strong> · Meaningfulness-based analysis</p>${cards}<p class="footer">Downloaded from Softly Community · Founder SINTU KUMAR RAI</p></main></body></html>`;
    const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${safeFileName(room.title || "softly-room")}-results.html`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    onNotice("Room result downloaded with every entry and picture.");
  };

  return (
    <div className="modalBackdrop roomBackdrop" onClick={onClose}>
      <m.section
        className="roomHub"
        role="dialog"
        aria-modal="true"
        aria-labelledby="room-hub-title"
        initial={{ opacity: 0, y: 18, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        onClick={(event) => event.stopPropagation()}
      >
        <button className="modalClose" type="button" onClick={onClose} aria-label="Close rooms">
          <X size={20} />
        </button>

        {!activeCode ? (
          <div className="roomLobby">
            <header className="roomHero">
              <span className="roomHeroIcon"><UsersRound size={26} /></span>
              <div>
                <p className="eyebrow">SCHOOL & COLLEGE CHALLENGES</p>
                <h2 id="room-hub-title">Host a thoughtful photo challenge.</h2>
                <p>
                  Create a private room, share one code with participants, collect
                  picture-led thoughts and reveal a meaningfulness-ranked result.
                </p>
              </div>
            </header>
            {error && <p className="roomError" role="alert">{error}</p>}
            <div className="roomLobbyGrid">
              <form className="roomActionCard" onSubmit={createRoom}>
                <span className="roomCardIcon"><Plus size={20} /></span>
                <h3>Create a challenge</h3>
                <p>You become the organizer. Participants choose their own theme when joining.</p>
                <label>
                  Room title
                  <input
                    value={createDraft.title}
                    onChange={(event) =>
                      setCreateDraft((current) => ({ ...current, title: event.target.value }))
                    }
                    maxLength={80}
                    placeholder="Inter-school ideas challenge"
                    required
                  />
                </label>
                <button className="primaryAction" disabled={busy}>
                  <Plus size={15} /> {busy ? "Creating…" : "Create challenge"}
                </button>
              </form>

              <form className="roomActionCard" onSubmit={joinRoom}>
                <span className="roomCardIcon"><LogIn size={20} /></span>
                <h3>Join a challenge</h3>
                <p>Enter the six-character code shared by your school or college organizer.</p>
                <label>
                  Room code
                  <input
                    className="roomCodeInput"
                    value={joinCode}
                    onChange={(event) =>
                      setJoinCode(
                        event.target.value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, "").slice(0, 6),
                      )
                    }
                    inputMode="text"
                    autoComplete="off"
                    maxLength={6}
                    placeholder="ABC234"
                    aria-describedby="room-code-help"
                    required
                  />
                </label>
                <small id="room-code-help">Letters I/O and digits 0/1 are not used.</small>
                <label>
                  Choose your theme
                  <select value={joinTheme} onChange={(event) => setJoinTheme(event.target.value)}>
                    {themeOptions.map((item) => (
                      <option key={item.name}>{item.name}</option>
                    ))}
                  </select>
                </label>
                {joinThemeDefinition && (
                  <div className="roomTemplateHint">
                    <strong>{joinThemeDefinition.template.title}</strong>
                    <span>{joinThemeDefinition.template.summary}</span>
                  </div>
                )}
                <button className="primaryAction" disabled={busy || joinCode.length !== 6}>
                  <LogIn size={15} /> {busy ? "Joining…" : "Join room"}
                </button>
              </form>
            </div>

            <section className="roomHistorySection" aria-labelledby="room-history-title">
              <header>
                <div>
                  <p className="eyebrow">SAVED ACTIVITY</p>
                  <h3 id="room-history-title"><History size={18} /> Your challenge history</h3>
                </div>
                <span>Completed rooms stay saved until the organizer permanently deletes them.</span>
              </header>
              {historyLoading ? (
                <div className="roomHistoryEmpty">Loading your rooms…</div>
              ) : roomHistory.length ? (
                <div className="roomHistoryList">
                  {roomHistory.map((item) => (
                    <button key={item.roomId} type="button" onClick={() => saveActiveCode(item.roomId)}>
                      <span className={`roomHistoryStatus ${item.status || "open"}`}>
                        {item.status === "complete" ? "Result ready" : item.status === "closed" ? "Closed" : "Open"}
                      </span>
                      <span>
                        <strong>{item.title}</strong>
                        <small>{item.role === "host" ? "Organizer" : "Participant"} · Hosted by {item.hostName}</small>
                      </span>
                      <b>{item.roomId} →</b>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="roomHistoryEmpty">
                  Your created and joined challenge rooms will appear here.
                </div>
              )}
            </section>
          </div>
        ) : loading ? (
          <div className="roomLoading" aria-live="polite">
            <span />
            <span />
            <span />
            <p>Opening room…</p>
          </div>
        ) : !room ? (
          <div className="roomMissing">
            <h2 id="room-hub-title">Room unavailable</h2>
            <p>{error || "This room could not be opened."}</p>
            <button className="primaryAction" onClick={leaveRoomView}>Try another code</button>
          </div>
        ) : (
          <div className="roomWorkspace">
            <header className="roomWorkspaceHead">
              <div>
                <button className="roomBack" type="button" onClick={leaveRoomView}>← All rooms</button>
                <p className="eyebrow">{isComplete ? "FINAL RESULT" : isClosed ? "ROOM CLOSED" : "LIVE ROOM"}</p>
                <h2 id="room-hub-title">{room.title}</h2>
                <p>Participant-selected themes · Hosted by {room.hostName}</p>
              </div>
              <button className="roomCode" type="button" onClick={copyCode} aria-label={`Copy room code ${activeCode}`}>
                <span>JOIN CODE</span>
                <strong>{activeCode}</strong>
                <Copy size={15} />
              </button>
            </header>

            {error && <p className="roomError" role="alert">{error}</p>}

            <div className="roomProgress" aria-label="Room progress">
              <div>
                <UsersRound size={16} />
                <strong>{participants.length}</strong>
                <span>participants</span>
              </div>
              <div>
                <CheckCircle2 size={16} />
                <strong>{submissions.length}</strong>
                <span>submitted</span>
              </div>
              <div className={canFinalize || isComplete ? "ready" : ""}>
                <Sparkles size={16} />
                <strong>{isComplete ? "Complete" : canFinalize ? "Ready" : `${Math.max(0, participants.length - submissions.length)} left`}</strong>
                <span>for analysis</span>
              </div>
            </div>

            {!isComplete ? (
              <div className="roomOpenLayout">
                <aside className="roomRoster">
                  <header>
                    <h3>Participants</h3>
                    <span>{isClosed ? "Closed" : "Live"}</span>
                  </header>
                  <div>
                    {participants.map((participant) => {
                      const submitted = submissions.some(
                        (item) => item.userId === participant.userId,
                      );
                      return (
                        <div className="roomParticipant" key={participant.userId}>
                          <RoomAvatar name={participant.displayName} photoURL={participant.photoURL} />
                          <span>
                            <strong>{participant.displayName}</strong>
                            <small>
                              {participant.userId === room.hostId ? "Host" : "Participant"}
                              {` · ${participant.theme || room.theme || "Theme pending"}`}
                            </small>
                          </span>
                          <CheckCircle2 className={submitted ? "submitted" : "waiting"} size={17} />
                        </div>
                      );
                    })}
                  </div>
                  <p>Entries stay private until the host reveals the result.</p>
                </aside>

                {isClosed ? (
                  <section className="roomEntryForm roomClosedNotice" aria-live="polite">
                    <span><Lock size={24} /></span>
                    <p className="eyebrow">ENTRIES LOCKED</p>
                    <h3>This room is closed</h3>
                    <p>
                      The host has stopped new joins and entry changes. Submitted thoughts are
                      ready for final analysis.
                    </p>
                  </section>
                ) : (
                <form className="roomEntryForm" onSubmit={submitThought}>
                  <div>
                    <p className="eyebrow">YOUR ENTRY</p>
                    <h3>{ownSubmission ? "Refine your thought" : "Share your thought"}</h3>
                    {selectedTheme && (
                      <div className="roomTemplateHint">
                        <strong>{selectedTheme.template.title}</strong>
                        <span>{selectedTheme.template.summary}</span>
                      </div>
                    )}
                  </div>
                  <label>
                    Your theme
                    <select value={entryTheme} onChange={(event) => setEntryTheme(event.target.value)}>
                      {themeOptions.map((item) => (
                        <option key={item.name}>{item.name}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Title
                    <input
                      value={entryDraft.title}
                      onChange={(event) =>
                        setEntryDraft((current) => ({ ...current, title: event.target.value }))
                      }
                      maxLength={100}
                      placeholder="A clear title for your idea"
                      required
                    />
                  </label>
                  <label>
                    Your thought
                    <textarea
                      value={entryDraft.thought}
                      onChange={(event) =>
                        setEntryDraft((current) => ({ ...current, thought: event.target.value }))
                      }
                      minLength={80}
                      maxLength={3000}
                      placeholder="Describe what you noticed, why it matters, and the change or insight you want to share…"
                      required
                    />
                    <small>{entryDraft.thought.length}/3000 · minimum 80 characters</small>
                  </label>
                  <div className="roomPictureField">
                    {entryDraft.imageURL ? (
                      <div className="roomPicturePreview">
                        <img src={entryDraft.imageURL} alt="Your room entry preview" />
                        <button
                          type="button"
                          onClick={() =>
                            setEntryDraft((current) => ({ ...current, imageURL: "" }))
                          }
                        >
                          Replace picture
                        </button>
                      </div>
                    ) : (
                      <label className="roomPicturePicker">
                        <ImagePlus size={22} />
                        <strong>{imagePreparing ? "Preparing picture…" : "Add your picture"}</strong>
                        <span>JPG, PNG or WebP · automatically optimized</span>
                        <input type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseImage} disabled={imagePreparing} />
                      </label>
                    )}
                  </div>
                  <button className="primaryAction" disabled={busy || imagePreparing}>
                    <CheckCircle2 size={15} /> {busy ? "Saving…" : ownSubmission ? "Update entry" : "Submit entry"}
                  </button>
                </form>
                )}
              </div>
            ) : (
              <div className="roomResults">
                <section className="roomWinner">
                  <span><Crown size={27} /></span>
                  <div>
                    <p className="eyebrow">ROOM WINNER</p>
                    <h3>{ranking[0]?.displayName}</h3>
                    <p>{ranking[0]?.title}</p>
                  </div>
                  {ranking[0] && <ScorePill score={ranking[0].score} />}
                </section>
                <div className="roomRanking">
                  {ranking.map((entry, index) => (
                    <article key={entry.userId} className={index === 0 ? "winner" : ""}>
                      <span className="roomRank">{index + 1}</span>
                      <img src={entry.imageURL} alt={`Picture shared by ${entry.displayName}`} loading="lazy" decoding="async" />
                      <div>
                        <small>{entry.displayName} · {entry.theme || room.theme || "Student Innovation"}</small>
                        <h3>{entry.title}</h3>
                        <p>{entry.thought}</p>
                        <strong>{entry.analysis.feedback}</strong>
                      </div>
                      <ScorePill score={entry.score} />
                    </article>
                  ))}
                </div>
                {isHost && (
                  <section className="roomParticipationHistory">
                    <header>
                      <div>
                        <p className="eyebrow">ORGANIZER RECORD</p>
                        <h3>Participation history</h3>
                      </div>
                      <span>{participants.length} joined · {submissions.length} submitted</span>
                    </header>
                    <div>
                      {participants.map((participant) => {
                        const entry = submissions.find((item) => item.userId === participant.userId);
                        return (
                          <article key={participant.userId}>
                            <RoomAvatar name={participant.displayName} photoURL={participant.photoURL} />
                            <span>
                              <strong>{participant.displayName}</strong>
                              <small>{participant.theme || entry?.theme || "Theme not selected"}</small>
                            </span>
                            <b className={entry ? "submitted" : "waiting"}>
                              {entry ? "Submitted" : "No entry"}
                            </b>
                          </article>
                        );
                      })}
                    </div>
                  </section>
                )}
                <button className="primaryAction roomDownload" type="button" onClick={downloadResults}>
                  <Download size={16} /> Download complete result
                </button>
              </div>
            )}

            {isHost && (
              <div className="roomHostBar">
                <div>
                  <strong>Host controls</strong>
                  <span>
                    {isComplete
                      ? "The result and participant history stay saved until you permanently delete this room."
                      : isClosed
                        ? ranking.length >= 2
                          ? "Room is closed. Submitted entries are ready for analysis."
                          : "Room is closed, but at least two submitted entries are needed."
                        : allSubmitted
                          ? "Everyone has submitted. Analyze now or close the room first."
                          : "Close the room anytime to stop new joins and lock current entries."}
                  </span>
                </div>
                <div className="roomAdminActions">
                  {!isComplete && !isClosed && (
                    <button className="roomCloseButton" type="button" onClick={closeRoom} disabled={busy}>
                      <Lock size={15} /> Close room
                    </button>
                  )}
                  {!isComplete && (
                    <button className="primaryAction" type="button" onClick={finalizeRoom} disabled={!canFinalize || busy}>
                      <Sparkles size={15} /> {busy ? "Working…" : "Analyze & reveal winner"}
                    </button>
                  )}
                  <button className="roomDangerButton" type="button" onClick={deleteRoom} disabled={busy}>
                    <Trash2 size={15} /> Delete permanently
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </m.section>
    </div>
  );
}
