import React, { useState, useEffect } from "react";
import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css"; // import styles
import "./App.css";
import { collection, addDoc, serverTimestamp, query, orderBy, getDocs } from "firebase/firestore";
import { db } from "./firebase";

function formatTime(seconds) {
  seconds = Math.floor(seconds);
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  // Pad with leading zeros if needed, e.g. 01:09:05
  const paddedHrs = hrs.toString().padStart(2, "0");
  const paddedMins = mins.toString().padStart(2, "0");
  const paddedSecs = secs.toString().padStart(2, "0");

  return `${paddedHrs}:${paddedMins}:${paddedSecs}`;
}

function hoursToSeconds(decimalHours) {
  return Math.floor(decimalHours * 3600);
}

export default function App() {
  const [date, setDate] = useState(new Date());
  const [currentStreak, setCurrentStreak] = useState(0); // example streak count
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [isCreatingNewProject, setIsCreatingNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [projects, setProjects] = useState([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [showOpenProjectModal, setShowOpenProjectModal] = useState(false);
  const [selectedProject, setSelectedProject] = useState(null); // currently opened project
  const [showLogTimeModal, setShowLogTimeModal] = useState(false);
  const [manualTime, setManualTime] = useState(""); // time input as string, e.g. "2.5" hours
  const [totalSeconds, setTotalSeconds] = useState(0); // changed name here
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerStartTime, setTimerStartTime] = useState(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [streakDates, setStreakDates] = useState([]);


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

  useEffect(() => {
    let interval;
    if (timerRunning && !isPaused) {
      interval = setInterval(() => {
        setElapsedTime((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [timerRunning, isPaused]);

  useEffect(() => {
    const savedStart = localStorage.getItem("yarnTimerStart");
    if (savedStart) {
      setTimerStartTime(Number(savedStart));
      setTimerRunning(true);
    }
  }, []);

  useEffect(() => {
  const savedProjectId = localStorage.getItem("selectedProjectId");

  const fetchAndSet = async () => {
    const q = query(collection(db, "projects"), orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);
    if (snapshot.empty) return;

    let projectDoc;
    if (savedProjectId) {
      projectDoc = snapshot.docs.find(doc => doc.id === savedProjectId);
    }

    // Fallback to first project if saved one isn't found
    if (!projectDoc) {
      projectDoc = snapshot.docs[0];
    }

    if (projectDoc) {
      const project = { id: projectDoc.id, ...projectDoc.data() };
      setSelectedProject(project);
      localStorage.setItem("selectedProjectId", project.id);
      calculateCurrentStreak(project.id);
      fetchTotalHours(project.id);
    }
  };

  fetchAndSet();
}, []);



async function calculateCurrentStreak(projectId) {
  try {
    const logsRef = collection(db, "projects", projectId, "logs");
    const logsSnapshot = await getDocs(query(logsRef));

    const logDates = logsSnapshot.docs
      .map(doc => doc.data().timestamp?.toDate())
      .filter(Boolean);

    const uniqueDays = [];
    logDates.forEach(date => {
      const normalized = startOfDay(date);
      if (!uniqueDays.some(d => isSameDayJS(d, normalized))) {
        uniqueDays.push(normalized);
      }
    });

    uniqueDays.sort((a, b) => b - a);
    let streak = 0;
    let currentDay = startOfDay(new Date());
    const daysInStreak = [];

    while (uniqueDays.some(d => isSameDayJS(d, currentDay))) {
      streak++;
      daysInStreak.push(currentDay);
      currentDay = new Date(currentDay.getTime() - 24 * 60 * 60 * 1000);
    }

    setCurrentStreak(streak);
    setStreakDates(daysInStreak.map(d => d.toDateString())); // store streak days as strings
  } catch (error) {
    console.error("Error calculating streak:", error);
    setCurrentStreak(0);
    setStreakDates([]);
  }
}



  async function fetchProjects() {
    setIsLoadingProjects(true);
    try {
      const q = query(collection(db, "projects"), orderBy("createdAt", "desc"));
      const querySnapshot = await getDocs(q);
      const projectsList = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
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
        if (data.hours) {
          totalSecs += parseFloat(data.hours) * 3600;
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
        <h2>🔥 Current Streak: {currentStreak} days</h2>
      </div>

      <Calendar
        onChange={setDate}
        value={date}
        tileClassName={({ date, view }) => {
          if (view === "month") {
            const dateStr = date.toDateString();
            if (streakDates.includes(dateStr)) return "streak-day";
            if (isToday(date)) return "highlight-today";
          }
          return null;
        }}
      />


      {selectedProject && (
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
            onClick={(e) => e.stopPropagation()} // prevent modal close when clicking inside
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

            <button className="close-button" onClick={() => setShowProjectModal(false)}>Cancel</button>
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
                if (!newProjectName.trim()) return; // prevent empty names

                try {
                  const docRef = await addDoc(collection(db, "projects"), {
                    name: newProjectName,
                    createdAt: serverTimestamp()
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
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>Select a Project</h3>
            {isLoadingProjects ? (
              <div style={{ textAlign: "center" }}>
                <div className="spinner"></div>
                <p>Loading projects...</p>
              </div>
            ) : projects.length === 0 ? (
              <p>No projects found</p>
            ) : (
              projects.map(project => (
                <button
                  key={project.id}
                  className="modal-button"
                  onClick={() => {
                    setSelectedProject(project);
                    localStorage.setItem("selectedProjectId", project.id);
                    fetchTotalHours(project.id);
                    calculateCurrentStreak(project.id);

                    setShowOpenProjectModal(false);
                    setShowLogTimeModal(true);
                  }}
                >
                  {project.name}
                </button>
              ))
            )}
            <button className="close-button" onClick={() => setShowOpenProjectModal(false)}>Cancel</button>
          </div>
        </div>
      )}

      {showLogTimeModal && selectedProject && (
        <div className="modal-overlay" onClick={() => setShowLogTimeModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>Log Time for: {selectedProject.name}</h3>

            {timerRunning && (
              <p style={{ marginTop: "0.5rem" }}>
                🕒 Timer Running: {formatTime(elapsedTime)}
              </p>
            )}

            <input
              type="number"
              placeholder="Hours worked (e.g. 2.5)"
              value={manualTime}
              onChange={(e) => setManualTime(e.target.value)}
              min="0"
              step="0.1"
              className="project-input"
            />
            <button
              className="modal-button"
              onClick={async () => {
                const hours = parseFloat(manualTime);
                if (isNaN(hours) || hours <= 0) return alert("Please enter a valid positive number.");

                try {
                  await addDoc(
                    collection(db, "projects", selectedProject.id, "logs"),
                    {
                      hours: parseFloat(manualTime),
                      timestamp: serverTimestamp()
                    }
                  );
                  console.log("✅ Time logged successfully");
                } catch (error) {
                  console.error("❌ Error logging time:", error);
                  alert("Failed to log time.");
                }

                setManualTime("");
                setShowLogTimeModal(false);
                calculateCurrentStreak(selectedProject.id);
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
                  localStorage.setItem("yarnTimerStart", now);
                  alert("⏱️ Timer started!");
                }}
              >
                ▶️ Start Timer
              </button>
            ) : (
              <div>
                <p>🕒 Timer: {formatTime(elapsedTime)}</p>

                {!isPaused ? (
                  <button className="modal-button" onClick={() => setIsPaused(true)}>
                    ⏸ Pause
                  </button>
                ) : (
                  <button className="modal-button" onClick={() => setIsPaused(false)}>
                    ▶️ Resume
                  </button>
                )}

                <button
                  className="modal-button"
                  onClick={async () => {
                    const hours = elapsedTime / 3600;
                    if (!selectedProject) return;

                    try {
                      await addDoc(
                        collection(db, "projects", selectedProject.id, "logs"),
                        {
                          hours: parseFloat(hours.toFixed(4)),
                          timestamp: serverTimestamp()
                        }
                      );
                      alert(`⏹️ Timer stopped. Logged ${hours.toFixed(4)} hrs`);
                    } catch (err) {
                      console.error("❌ Error logging:", err);
                      alert("Failed to save time log.");
                    }

                    // Reset
                    setTimerRunning(false);
                    setIsPaused(false);
                    setTimerStartTime(null);
                    setElapsedTime(0);
                    localStorage.removeItem("yarnTimerStart");
                    setShowLogTimeModal(false);
                    calculateCurrentStreak(selectedProject.id);
                    fetchTotalHours(selectedProject.id);
                    setSelectedProject(null);
                  }}
                >
                  ⏹ Stop & Save
                </button>
              </div>
            )}

            <button className="close-button" onClick={() => setShowLogTimeModal(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

// Helper to check if the date is today
function isToday(date) {
  const today = new Date();
  return (
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  );
}
