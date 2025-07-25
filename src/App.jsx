import React, { useState, useEffect } from "react";
import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";
import "./App.css";
import {
  collection,
  addDoc,
  serverTimestamp,
  query,
  orderBy,
  getDocs,
} from "firebase/firestore";
import { db } from "./firebase";

function formatTime(seconds) {
  seconds = Math.floor(seconds);
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hrs.toString().padStart(2, "0")}:${mins
    .toString()
    .padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

function hoursToSeconds(decimalHours) {
  return Math.floor(decimalHours * 3600);
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isSameDayJS(d1, d2) {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

function isToday(date) {
  const today = new Date();
  return (
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  );
}

export default function App() {
  const [date, setDate] = useState(new Date());
  const [currentStreak, setCurrentStreak] = useState(0);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [isCreatingNewProject, setIsCreatingNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [projects, setProjects] = useState([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [showOpenProjectModal, setShowOpenProjectModal] = useState(false);
  const [selectedProject, setSelectedProject] = useState(null);
  const [showLogTimeModal, setShowLogTimeModal] = useState(false);
  const [manualTime, setManualTime] = useState("");
  const [totalSeconds, setTotalSeconds] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerStartTime, setTimerStartTime] = useState(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [streakDates, setStreakDates] = useState([]);
  const [isStreakLoading, setIsStreakLoading] = useState(false);
  const [projectManuallySelected, setProjectManuallySelected] = useState(false);
  const [logDate, setLogDate] = useState(new Date());
  const [lastLoggedTime, setLastLoggedTime] = useState(null);





  useEffect(() => {
    calculateGlobalStreak();
  }, []);

  // Persistent Timer
  useEffect(() => {
    const savedStart = localStorage.getItem("yarnTimerStart");
    const savedPaused = localStorage.getItem("yarnTimerPaused");
    if (savedStart) {
      setTimerStartTime(Number(savedStart));
      setTimerRunning(true);
      setIsPaused(savedPaused === "true");
    }
  }, []);

  useEffect(() => {
    let interval;
    if (timerRunning && !isPaused) {
      interval = setInterval(() => {
        const now = Date.now();
        const elapsed = Math.floor((now - timerStartTime) / 1000);
        setElapsedTime(elapsed);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [timerRunning, isPaused, timerStartTime]);

  useEffect(() => {
    const savedProjectId = localStorage.getItem("selectedProjectId");
    const fetchAndSet = async () => {
      const q = query(collection(db, "projects"), orderBy("createdAt", "desc"));
      const snapshot = await getDocs(q);
      if (snapshot.empty) return;
      let projectDoc;
      if (savedProjectId) {
        projectDoc = snapshot.docs.find((doc) => doc.id === savedProjectId);
      }
      if (!projectDoc) {
        projectDoc = snapshot.docs[0];
      }
      if (projectDoc) {
        const project = { id: projectDoc.id, ...projectDoc.data() };
        setSelectedProject(project);
        localStorage.setItem("selectedProjectId", project.id);
        calculateGlobalStreak();
        fetchTotalHours(project.id);
      }
    };
    fetchAndSet();
  }, []);

  async function calculateGlobalStreak() {
  setIsStreakLoading(true);
  try {
    const projectsSnapshot = await getDocs(collection(db, "projects"));
    const allDates = [];

    for (const projectDoc of projectsSnapshot.docs) {
      const logsRef = collection(db, "projects", projectDoc.id, "logs");
      const logsSnapshot = await getDocs(logsRef);

      logsSnapshot.forEach((doc) => {
        const timestamp = doc.data().timestamp?.toDate();
        if (timestamp) {
          const normalized = startOfDay(timestamp);
          if (!allDates.some((d) => isSameDayJS(d, normalized))) {
            allDates.push(normalized);
          }
        }
      });
    }

    allDates.sort((a, b) => b - a);

    // Set streakDates for calendar highlighting
    setStreakDates(allDates.map(d => d.toDateString()));

    let streak = 0;
    let currentDay = startOfDay(new Date());

    while (allDates.some((d) => isSameDayJS(d, currentDay))) {
      streak++;
      currentDay = new Date(currentDay.getTime() - 86400000);
    }

    setCurrentStreak(streak);
  } catch (error) {
    console.error("Error calculating streak:", error);
    setCurrentStreak(0);
  } finally {
    setIsStreakLoading(false);
  }
}

const fetchLastLog = async (projectId) => {
  const logsRef = collection(db, "projects", projectId, "logs");
  const logsSnapshot = await getDocs(query(logsRef, orderBy("timestamp", "desc")));
  if (!logsSnapshot.empty) {
    const latest = logsSnapshot.docs[0].data();
    setLastLoggedTime({
      hours: latest.hours,
      timestamp: latest.timestamp?.toDate(),
    });
  } else {
    setLastLoggedTime(null);
  }
};


  async function fetchProjects() {
    setIsLoadingProjects(true);
    try {
      const q = query(collection(db, "projects"), orderBy("createdAt", "desc"));
      const querySnapshot = await getDocs(q);
      const projectsList = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setProjects(projectsList);
    } catch (error) {
      console.error("Error fetching projects:", error);
    }
    setIsLoadingProjects(false);
  }

  const fetchTotalHours = async (projectId) => {
    try {
      const logsRef = collection(db, "projects", projectId, "logs");
      const logsSnapshot = await getDocs(query(logsRef));
      let totalSecs = 0;
      logsSnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.minutes) {
          totalSecs += parseInt(data.minutes) * 60;
        }

      });
      setTotalSeconds(totalSecs);
    } catch (error) {
      console.error("❌ Error fetching logs:", error);
    }
  };

  return (
    <div className="app-container">
      <h1>Yarn Streak</h1>
      <div className="streak-display">
        {isStreakLoading ? (
         <p>Loading streak...</p>
        ) : (
           <h2>🔥 Current Streak: {currentStreak} days</h2>
         )}
      </div>

      <Calendar
        onChange={setDate}
        value={date}
        tileClassName={({ date, view }) => {
          if (view !== "month") return null;

          const dateStr = startOfDay(date).toDateString();
          const inStreak = streakDates.includes(dateStr);
          const isTodayDate = isToday(date);

          if (!inStreak && !isTodayDate) return null;

          const prev = startOfDay(new Date(date.getTime() - 86400000));
          const next = startOfDay(new Date(date.getTime() + 86400000));

          const hasPrev = streakDates.includes(prev.toDateString());
          const hasNext = streakDates.includes(next.toDateString());

          console.log({
            dateStr,
            hasPrev,
            hasNext,
            class: 
              isTodayDate ? "today-highlight" : 
              hasPrev && hasNext ? "streak-middle" : 
              !hasPrev && hasNext ? "streak-start" : 
              hasPrev && !hasNext ? "streak-end" : 
              !hasPrev && !hasNext ? "streak-single" : null
          });

          if (isTodayDate) return "today-highlight";
          if (hasPrev && hasNext) return "streak-middle";
          if (!hasPrev && hasNext) return "streak-start";
          if (hasPrev && !hasNext) return "streak-end";
          if (!hasPrev && !hasNext) return "streak-single";

          return null;
        }}




      />

      {selectedProject && projectManuallySelected && (
        <div className="summary-display">
          <h3>🕒 Total Time Logged: {formatTime(totalSeconds)}</h3>
        </div>
      )}

      <button
        className="add-project-button"
        onClick={() => setShowProjectModal(true)}
      >
        ➕ Add Project
      </button>

      {showProjectModal && (
        <div className="modal-overlay" onClick={() => setShowProjectModal(false)}>
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <h3>Select an option</h3>
            <button
              className="modal-button"
              onClick={() => {
                setIsCreatingNewProject(true);
                setShowProjectModal(false);
              }}
            >
              🆕 New Project
            </button>
            <button
              className="modal-button"
              onClick={() => {
                fetchProjects();
                setShowOpenProjectModal(true);
                setShowProjectModal(false);
              }}
            >
              📂 Open Project
            </button>
            <button
              className="close-button"
              onClick={() => setShowProjectModal(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {isCreatingNewProject && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Name Your Project</h3>
            <input
              type="text"
              placeholder="e.g. Website Redesign"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              className="project-input"
            />
            <button
              className="modal-button"
              onClick={async () => {
                if (!newProjectName.trim()) return;
                try {
                  const docRef = await addDoc(collection(db, "projects"), {
                    name: newProjectName,
                    createdAt: serverTimestamp(),
                  });
                  console.log("✅ Project saved with ID:", docRef.id);
                } catch (error) {
                  console.error("❌ Error adding project:", error);
                }
                setIsCreatingNewProject(false);
                setNewProjectName("");
              }}
            >
              ✅ Create
            </button>
            <button
              className="close-button"
              onClick={() => setIsCreatingNewProject(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {showOpenProjectModal && (
        <div className="modal-overlay" onClick={() => setShowOpenProjectModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Select a Project</h3>
            {isLoadingProjects ? (
              <div style={{ textAlign: "center" }}>
                <div className="spinner"></div>
                <p>Loading projects...</p>
              </div>
            ) : projects.length === 0 ? (
              <p>No projects found</p>
            ) : (
              projects.map((project) => (
                <button
                  key={project.id}
                  className="modal-button"
                 onClick={() => {
                    setSelectedProject(project);
                    setLogDate(new Date());
                    localStorage.setItem("selectedProjectId", project.id);
                    fetchTotalHours(project.id);
                    calculateGlobalStreak();
                    setShowOpenProjectModal(false);
                    setShowLogTimeModal(true);
                    setProjectManuallySelected(true);  // ✅ Mark as manually selected
              

                  }}

                >
                  {project.name}
                </button>
              ))
            )}
            <button
              className="close-button"
              onClick={() => setShowOpenProjectModal(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {showLogTimeModal && selectedProject && (
        <div className="modal-overlay" onClick={() => setShowLogTimeModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Log Time for: {selectedProject.name}</h3>
            {timerRunning && (
              <p style={{ marginTop: "0.5rem" }}>
                🕒 Timer Running: {formatTime(elapsedTime)}
              </p>
            )}

            <input
              type="number"
              placeholder="Minutes worked (e.g. 45)"
              value={manualTime}
              onChange={(e) => setManualTime(e.target.value)}
              min="0"
              step="1"
              className="project-input"
            />

            <p>Select Log Date:</p>
            <Calendar
              onChange={setLogDate}
              value={logDate}
            />


            <button
              className="modal-button"
              onClick={async () => {
                const hours = parseFloat(manualTime);
                if (isNaN(hours) || hours <= 0)
                  return alert("Please enter a valid positive number.");
                try {
                  await addDoc(
                    collection(db, "projects", selectedProject.id, "logs"),
                    {
                      minutes: parseInt(manualTime),
                      timestamp: new Date(
                      logDate.getFullYear(),
                      logDate.getMonth(),
                      logDate.getDate(),
                      12, 0, 0
                    ),

                    }
                  );
                  fetchTotalHours(selectedProject.id);
                  console.log("✅ Time logged successfully");
                } catch (error) {
                  console.error("❌ Error logging time:", error);
                  alert("Failed to log time.");
                }
                setManualTime("");
                setShowLogTimeModal(false);
                calculateGlobalStreak();
                setSelectedProject(null);
              }}
            >
              Log Time Manually
            </button>

            {!timerRunning ? (
              <button
                className="modal-button"
                onClick={() => {
                  const now = Date.now();
                  setTimerStartTime(now);
                  setTimerRunning(true);
                  setIsPaused(false);
                  setElapsedTime(0);
                  localStorage.setItem("yarnTimerStart", now.toString());
                  localStorage.setItem("yarnTimerPaused", "false");
                  alert("⏱️ Timer started!");
                }}
              >
                ▶️ Start Timer
              </button>
            ) : (
              <div>
                {!isPaused ? (
                  <button
                    className="modal-button"
                    onClick={() => {
                      setIsPaused(true);
                      localStorage.setItem("yarnTimerPaused", "true");
                    }}
                  >
                    ⏸ Pause
                  </button>
                ) : (
                  <button
                    className="modal-button"
                    onClick={() => {
                      setIsPaused(false);
                      localStorage.setItem("yarnTimerPaused", "false");
                    }}
                  >
                    ▶️ Resume
                  </button>
                )}
                <button
                  className="modal-button"
                  onClick={async () => {
                    const hours = elapsedTime / 3600;
                    try {
                      await addDoc(
                        collection(db, "projects", selectedProject.id, "logs"),
                        {
                          minutes: Math.round(elapsedTime / 60),
                          timestamp: new Date(
                            logDate.getFullYear(),
                            logDate.getMonth(),
                            logDate.getDate(),
                            12, 0, 0
                          ),

                        }
                      );
                      alert(`⏹️ Timer stopped. Logged ${hours.toFixed(4)} hrs`);
                    } catch (err) {
                      console.error("❌ Error logging:", err);
                      alert("Failed to save time log.");
                    }
                    setTimerRunning(false);
                    setIsPaused(false);
                    setTimerStartTime(null);
                    setElapsedTime(0);
                    localStorage.removeItem("yarnTimerStart");
                    localStorage.removeItem("yarnTimerPaused");
                    setShowLogTimeModal(false);
                    calculateGlobalStreak();
                    fetchTotalHours(selectedProject.id);
                    setSelectedProject(null);
                  }}
                >
                  ⏹ Stop & Save
                </button>
              </div>
            )}

            <button
              className="close-button"
              onClick={() => setShowLogTimeModal(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
