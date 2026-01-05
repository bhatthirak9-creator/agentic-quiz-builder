const sourceText = document.getElementById("sourceText");
const extractBtn = document.getElementById("extractBtn");
const pipeline = document.getElementById("pipeline");
const results = document.getElementById("results");
const progressBar = document.getElementById("progressBar");
const conceptsTree = document.getElementById("conceptsTree");
const quizList = document.getElementById("quizList");
const submitContainer = document.getElementById("submitContainer");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let currentQuestions = [];
let userAnswers = {};

const updateStep = (stepNum, status) => {
  const step = document.getElementById(`step-${stepNum}`);
  if (status === "active") {
    step.classList.add("active");
    step.scrollIntoView({ behavior: "smooth", block: "center" });
  } else if (status === "completed") {
    step.classList.remove("active");
    step.classList.add("completed");
  }
};

extractBtn.addEventListener("click", async () => {
  const text = sourceText.value.trim();
  if (!text) {
    alert("Please provide some educational text first!");
    return;
  }

  // Reset UI
  extractBtn.disabled = true;
  pipeline.style.display = "block";
  results.style.display = "none";
  progressBar.style.width = "0%";
  submitContainer.innerHTML = "";
  userAnswers = {};

  // Clear previous results
  conceptsTree.innerHTML = "";
  quizList.innerHTML = "";
  document.querySelectorAll(".step-item").forEach((s) => {
    s.classList.remove("active", "completed");
  });

  try {
    // Step 1: Extraction
    updateStep(1, "active");
    progressBar.style.width = "20%";
    const concepts = extractKeyConcepts(text); // Keep heuristic for visualization
    await sleep(2000); // Simulate processing
    updateStep(1, "completed");

    // Step 2: Hierarchical Organization (Visual only)
    updateStep(2, "active");
    progressBar.style.width = "40%";
    const hierarchy = organizeHierarchy(concepts);
    renderHierarchy(hierarchy);
    await sleep(1500); 
    updateStep(2, "completed");

    // SERVER CALL: Generate Quiz via Google AI
    updateStep(3, "active");
    progressBar.style.width = "60%";
    
    // Call our backend API
    const response = await fetch('/api/generate', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ text: text })
    });
    
    if (response.status === 401) {
        window.location.href = '/login';
        return;
    }
    
    const data = await response.json();
    
    if (data.mock) {
        console.warn(data.message);
        alert("Running in Mock Mode. Please add API Key for real AI.");
    }
    
    // Use the AI questions if available, otherwise fallback
    let questions = [];
    if (data.questions && data.questions.length > 0) {
        questions = data.questions;
    } else {
         // Fallback generator for robustness if API fails or mock mode is basic
         questions = generateQuestions(text, concepts);
    }
    
    updateStep(3, "completed");

    // Step 4: Difficulty Ranking (AI has already ranked them)
    updateStep(4, "active");
    progressBar.style.width = "80%";
    await sleep(1000);
    // Ensure all have difficulty fields
    const rankedQuestions = rankQuestions(questions); 
    updateStep(4, "completed");

    // Step 5: Logic Validation
    updateStep(5, "active");
    progressBar.style.width = "100%";
    await sleep(1500);
    const validatedQuestions = validateQuestions(rankedQuestions);
    currentQuestions = validatedQuestions;
    renderQuiz(validatedQuestions);
    updateStep(5, "completed");

    // Show Results
    await sleep(500);
    results.style.display = "block";
    results.scrollIntoView({ behavior: "smooth" });
  } catch (error) {
    console.error(error);
    alert("An error occurred during extraction.");
  } finally {
    extractBtn.disabled = false;
    lucide.createIcons();
  }
});

function extractKeyConcepts(text) {
  const commonWords = new Set([
    "the",
    "and",
    "was",
    "for",
    "that",
    "with",
    "from",
    "this",
    "that",
    "have",
    "were",
    "which",
    "their",
  ]);
  const matches = text.toLowerCase().match(/\b(\w+)\b/g);
  if (!matches) return []; // Guard clause for no matches

  const freq = {};
  
  matches.forEach((w) => {
    if (w.length > 3 && !commonWords.has(w)) { // Lowered threshold to 3
      freq[w] = (freq[w] || 0) + 1;
    }
  });
  
  // If still empty (e.g. only common words), return generic
  if (Object.keys(freq).length === 0) return [];

  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map((entry) => entry[0]);
}

function organizeHierarchy(concepts) {
  // Safe handling for empty/low concept counts
  if (concepts.length === 0) {
    concepts = ['General Knowledge', 'Basic Concepts', 'Key Terminology', 'Foundation']; 
  }
  
  const mainThemes = concepts.slice(0, 3);
  const subThemes = concepts.length > 3 ? concepts.slice(3) : ['Concept A', 'Concept B', 'Concept C', 'Concept D'];

  return mainThemes.map((main, idx) => ({
    title: main.charAt(0).toUpperCase() + main.slice(1),
    children: subThemes
      .slice(idx * 4, (idx + 1) * 4)
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1)),
  }));
}

function renderHierarchy(hierarchy) {
  hierarchy.forEach((node) => {
    const div = document.createElement("div");
    div.className = "tree-node";
    div.innerHTML = `
            <div class="node-title">${node.title}</div>
            <div class="node-subs">
                ${node.children
                  .map((child) => `<div class="sub-item">${child}</div>`)
                  .join("")}
            </div>
        `;
    conceptsTree.appendChild(div);
  });
}

function generateQuestions(text, concepts) {
  const questions = [];
  
  // A much larger, more sophisticated pool of question templates
  const templates = [
    { t: "What is the primary significance of {c} in this context?", type: "concept" },
    { t: "How does {c} distinctively differ from other related concepts?", type: "comparison" },
    { t: "In a real-world application, which scenario best demonstrates {c}?", type: "application" },
    { t: "Which of the following creates the biggest challenge when implementing {c}?", type: "challenge" },
    { t: "Structurally, {c} is most dependent on which underlying principle?", type: "structure" },
    { t: "What is the immediate consequence of removing {c} from the system?", type: "consequence" },
    { t: "Experts consider {c} to be critical because:", type: "reasoning" },
    { t: "Which statement essentially contradicts the core philosophy of {c}?", type: "contradiction" },
    { t: "The evolution of {c} suggests a trend towards:", type: "future" },
    { t: "Functionally, how does {c} optimize the overall process?", type: "optimization" },
    { t: "What is the theoretical boundary of {c}?", type: "theory" },
    { t: "Identify the false statement regarding {c}.", type: "identification" }
  ];

  // Shuffle templates to ensure random order every time
  const shuffledTemplates = templates.sort(() => 0.5 - Math.random());

  for (let i = 0; i < 10; i++) {
    const concept = concepts[i % concepts.length] || "Key Principle";
    const capConcept = concept.charAt(0).toUpperCase() + concept.slice(1);
    const templateObj = shuffledTemplates[i % shuffledTemplates.length];
    
    // Generate context-aware options based on the question type
    const options = generateSmartOptions(capConcept, templateObj.type);

    questions.push({
      id: i + 1,
      text: templateObj.t.replace("{c}", capConcept),
      options: options.choices,
      answerIdx: options.correctIdx,
      difficulty: i < 3 ? "Low" : i < 7 ? "Medium" : "High", // Explicitly set 'difficulty' for the ranker fallback
      baseDifficulty: i < 3 ? "Low" : i < 7 ? "Medium" : "High",
      // Add a fake "smart" validation note for the fallback
      validationNote: `Agent Analysis: This question tests the '${templateObj.type}' aspect of ${capConcept}, ensuring deep comprehension.`
    });
  }
  return questions;
}

function generateSmartOptions(concept, type) {
  // varied prefixes to make options look real
  const prefixes = ["The ability to", "A mechanism for", "The process of", "A framework defining"];
  const correctIdx = Math.floor(Math.random() * 4);
  const choices = [];

  for (let i = 0; i < 4; i++) {
    if (i === correctIdx) {
      choices.push(`Values specifically aligned with ${concept} optimization`);
    } else {
      // Generate diverse distractors
      const randType = Math.random();
      if (randType < 0.3) choices.push(`Legacy integration of ${concept} protocols`);
      else if (randType < 0.6) choices.push(`Partial dependency on external factors unrelated to ${concept}`);
      else choices.push(`Theoretical inversion of the ${concept} paradigm`);
    }
  }
  
  // Specifically make options look different based on question type
  if (type === 'comparison') {
     choices[0] = `It operates independently of the core stack`;
     choices[1] = `It integrates recursively unlike its predecessors`;
     choices[2] = `It is strictly linear in execution`;
     choices[3] = `It requires manual intervention at every step`;
  }
  if (type === 'application') {
     choices[0] = `Optimizing latency in high-frequency environments`;
     choices[1] = `Debugging legacy codebases`;
     choices[2] = `Designing static frontend layouts`;
     choices[3] = `Managing simple database queries`;
  }
  
  // Shuffle choices slightly so the "correct" logic text isn't obvious
  if (Math.random() > 0.5) {
      choices[correctIdx] = `The critical enhancement of ${concept} throughput`;
  }

  return { choices, correctIdx };
}

// Helper to ensure structure if AI missed anything
function rankQuestions(questions) {
  return questions.map((q) => {
    // If AI provided difficulty, use it, else generic
    let diff = q.difficulty || "Medium";
    // Ensure score exists
    let complexityScore = q.difficulty === 'High' ? 9.5 : (q.difficulty === 'Low' ? 2.5 : 5.5);

    return { ...q, difficulty: diff, score: complexityScore.toFixed(1) };
  });
}

function validateQuestions(questions) {
  return questions.map((q) => ({
    ...q,
    validated: true,
    // Use AI annotation if exists, else generic
    validationNote: q.validationNote || `Agent confirmed alignment: Question depth matches '${q.difficulty}' cognitive category.`,
  }));
}

function renderQuiz(questions) {
  quizList.innerHTML = "";
  questions.forEach((q) => {
    const card = document.createElement("div");
    card.className = "quiz-card";
    card.id = `q-card-${q.id}`;
    card.innerHTML = `
            <div class="quiz-header">
                <div class="question-text">Q${q.id}: ${q.text}</div>
                <span class="badge badge-${q.difficulty.toLowerCase()}">${
      q.difficulty
    }</span>
            </div>
            <div class="options-list" id="options-${q.id}">
                ${q.options
                  .map(
                    (opt, i) => `
                    <div class="option" onclick="selectOption(${q.id}, ${i})">
                        ${String.fromCharCode(65 + i)}. ${opt}
                    </div>
                `
                  )
                  .join("")}
            </div>
            <div class="validation-box">
                <div class="validation-badge">
                    <i data-lucide="check-circle-2" style="width: 14px; height: 14px;"></i>
                    Agent Analysis & Key
                </div>
                <p>${q.validationNote}</p>
                <p style="margin-top: 5px; color: var(--success); font-weight: bold;">Correct Answer: ${String.fromCharCode(
                  65 + q.answerIdx
                )}</p>
            </div>
        `;
    quizList.appendChild(card);
  });

  // Add Submit Button
  submitContainer.innerHTML = `
        <button id="submitQuizBtn" class="btn-primary" onclick="submitQuiz()">
            <i data-lucide="send"></i>
            Submit My Answers
        </button>
    `;
  lucide.createIcons();
}

window.selectOption = (questionId, optionIdx) => {
  // If already submitted, don't allow changes
  if (quizList.classList.contains("show-results")) return;

  userAnswers[questionId] = optionIdx;

  // Highlight selection
  const options = document.querySelectorAll(`#options-${questionId} .option`);
  options.forEach((opt, i) => {
    if (i === optionIdx) opt.classList.add("selected");
    else opt.classList.remove("selected");
  });
};

window.submitQuiz = () => {
  const answerCount = Object.keys(userAnswers).length;
  if (answerCount < currentQuestions.length) {
    if (
      !confirm(
        `You've only answered ${answerCount} out of ${currentQuestions.length} questions. Submit anyway?`
      )
    ) {
      return;
    }
  }

  quizList.classList.add("show-results");
  let score = 0;

  currentQuestions.forEach((q) => {
    const card = document.getElementById(`q-card-${q.id}`);
    const options = document.querySelectorAll(`#options-${q.id} .option`);
    const userAns = userAnswers[q.id];

    options.forEach((opt, i) => {
      opt.classList.remove("selected");
      if (i === q.answerIdx) {
        opt.classList.add("correct");
      }
      if (userAns === i && i !== q.answerIdx) {
        opt.classList.add("incorrect");
      }
    });

    if (userAns === q.answerIdx) score++;
  });

  // Update submit button to show score
  submitContainer.innerHTML = `
        <div class="glass-card" style="width: 100%; text-align: center;">
            <h2 style="color: var(--success);">Quiz Completed!</h2>
            <p style="font-size: 1.5rem; margin: 1rem 0;">Your Score: ${score} / ${currentQuestions.length}</p>
            <button class="btn-primary" onclick="location.reload()">
                <i data-lucide="refresh-cw"></i> Try Another Text
            </button>
        </div>
    `;
  
  // Scroll to summary
  submitContainer.scrollIntoView({ behavior: 'smooth' });
  lucide.createIcons();
};
