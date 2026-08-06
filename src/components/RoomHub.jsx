import { useEffect, useMemo, useState } from "react";
import { m } from "framer-motion";
import {
  CheckCircle2,
  Copy,
  Crown,
  Download,
  ImagePlus,
  LogIn,
  Plus,
  Sparkles,
  UsersRound,
  X,
} from "lucide-react";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
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
  const [loading, setLoading] = useState(Boolean(activeCode));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [createDraft, setCreateDraft] = useState({
    title: "",
    theme: "Student Innovation",
  });
  const [entryDraft, setEntryDraft] = useState({
    title: "",
    thought: "",
    imageURL: "",
  });
  const [imagePreparing, setImagePreparing] = useState(false);

  const displayName = profile?.displayName || user.displayName || "Softly writer";
  const profilePhoto = profile?.photoURL || user.photoURL || "";

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

  useEffect(() => {
    if (!ownSubmission) return;
    setEntryDraft({
      title: ownSubmission.title || "",
      thought: ownSubmission.thought || "",
      imageURL: ownSubmission.imageURL || "",
    });
  }, [ownSubmission?.id, ownSubmission?.updatedAt]);

  const ranking = useMemo(
    () =>
      submissions
        .map((submission) => {
          const analysis = analyzeThought({
            title: submission.title,
            excerpt: submission.thought.slice(0, 240),
            body: submission.thought,
            theme: room?.theme,
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

  const selectedTheme = themeOptions.find((item) => item.name === room?.theme);
  const createTheme = themeOptions.find((item) => item.name === createDraft.theme);
  const allSubmitted =
    participants.length >= 2 && submissions.length === participants.length;
  const isHost = room?.hostId === user.uid;
  const isComplete = room?.status === "complete";

  const saveActiveCode = (code) => {
    setActiveCode(code);
    try {
      localStorage.setItem(storageKey, code);
    } catch {
      // The live room still works when private browsing blocks storage.
    }
  };

  const leaveRoomView = () => {
    setActiveCode("");
    setRoom(null);
    setError("");
    setEntryDraft({ title: "", thought: "", imageURL: "" });
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
    if (!themeOptions.some((item) => item.name === createDraft.theme)) {
      setError("Choose one of the available themes.");
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
              theme: createDraft.theme,
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
        joinedAt: serverTimestamp(),
      });
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
          joinedAt: serverTimestamp(),
        });
      }
      saveActiveCode(code);
      onNotice(`Joined room ${code}.`);
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

    setBusy(true);
    setError("");
    try {
      const analysis = analyzeThought({
        title,
        excerpt: thought.slice(0, 240),
        body: thought,
        theme: room.theme,
      });
      await setDoc(doc(db, "rooms", activeCode, "submissions", user.uid), {
        roomId: activeCode,
        userId: user.uid,
        displayName,
        profilePhoto,
        title,
        thought,
        imageURL: entryDraft.imageURL,
        theme: room.theme,
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

  const finalizeRoom = async () => {
    if (!isHost || !allSubmitted || !ranking.length) return;
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
              <small>${escapeHTML(room.theme)}</small>
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
                <p className="eyebrow">LIVE THOUGHT ROOMS</p>
                <h2 id="room-hub-title">Create together. Discover the strongest idea.</h2>
                <p>
                  Invite participants with one code, collect picture-led thoughts,
                  then reveal a meaningfulness-ranked result.
                </p>
              </div>
            </header>
            {error && <p className="roomError" role="alert">{error}</p>}
            <div className="roomLobbyGrid">
              <form className="roomActionCard" onSubmit={createRoom}>
                <span className="roomCardIcon"><Plus size={20} /></span>
                <h3>Create a room</h3>
                <p>You become the host and control when the final analysis starts.</p>
                <label>
                  Room title
                  <input
                    value={createDraft.title}
                    onChange={(event) =>
                      setCreateDraft((current) => ({ ...current, title: event.target.value }))
                    }
                    maxLength={80}
                    placeholder="Campus ideas challenge"
                    required
                  />
                </label>
                <label>
                  Theme
                  <select
                    value={createDraft.theme}
                    onChange={(event) =>
                      setCreateDraft((current) => ({ ...current, theme: event.target.value }))
                    }
                  >
                    {themeOptions.map((item) => (
                      <option key={item.name}>{item.name}</option>
                    ))}
                  </select>
                </label>
                {createTheme && (
                  <div className="roomTemplateHint">
                    <strong>{createTheme.template.title}</strong>
                    <span>{createTheme.template.summary}</span>
                  </div>
                )}
                <button className="primaryAction" disabled={busy}>
                  <Plus size={15} /> {busy ? "Creating…" : "Create room"}
                </button>
              </form>

              <form className="roomActionCard" onSubmit={joinRoom}>
                <span className="roomCardIcon"><LogIn size={20} /></span>
                <h3>Join with a code</h3>
                <p>Ask the host for the six-character code shown inside their room.</p>
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
                <button className="primaryAction" disabled={busy || joinCode.length !== 6}>
                  <LogIn size={15} /> {busy ? "Joining…" : "Join room"}
                </button>
              </form>
            </div>
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
                <p className="eyebrow">{isComplete ? "FINAL RESULT" : "LIVE ROOM"}</p>
                <h2 id="room-hub-title">{room.title}</h2>
                <p>{room.theme} · Hosted by {room.hostName}</p>
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
              <div className={allSubmitted ? "ready" : ""}>
                <Sparkles size={16} />
                <strong>{allSubmitted ? "Ready" : `${Math.max(0, participants.length - submissions.length)} left`}</strong>
                <span>for analysis</span>
              </div>
            </div>

            {!isComplete ? (
              <div className="roomOpenLayout">
                <aside className="roomRoster">
                  <header>
                    <h3>Participants</h3>
                    <span>Live</span>
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
                            <small>{participant.userId === room.hostId ? "Host" : "Participant"}</small>
                          </span>
                          <CheckCircle2 className={submitted ? "submitted" : "waiting"} size={17} />
                        </div>
                      );
                    })}
                  </div>
                  <p>Entries stay private until the host reveals the result.</p>
                </aside>

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
                        <small>{entry.displayName}</small>
                        <h3>{entry.title}</h3>
                        <p>{entry.thought}</p>
                        <strong>{entry.analysis.feedback}</strong>
                      </div>
                      <ScorePill score={entry.score} />
                    </article>
                  ))}
                </div>
                <button className="primaryAction roomDownload" type="button" onClick={downloadResults}>
                  <Download size={16} /> Download complete result
                </button>
              </div>
            )}

            {isHost && !isComplete && (
              <div className="roomHostBar">
                <div>
                  <strong>Host controls</strong>
                  <span>
                    {allSubmitted
                      ? "Everyone has submitted. The final ranking is ready."
                      : "Analysis unlocks when at least two participants have all submitted."}
                  </span>
                </div>
                <button className="primaryAction" type="button" onClick={finalizeRoom} disabled={!allSubmitted || busy}>
                  <Sparkles size={15} /> {busy ? "Analyzing…" : "Analyze & reveal winner"}
                </button>
              </div>
            )}
          </div>
        )}
      </m.section>
    </div>
  );
}
