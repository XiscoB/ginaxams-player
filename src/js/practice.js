/**
 * Practice Mode Manager
 * Handles the actual taking of exams and reviewing results
 */
class PracticeManager {
  constructor(app) {
    this.app = app; // Reference to main app (for navigation back)
    this.examData = null;
    this.currentQuestions = [];
    this.filteredQuestions = [];
    this.currentIndex = 0;
    this.userAnswers = {};
    this.mode = "practice"; // 'practice' or 'review'
    this.currentFilter = "all";
    
    // Bind UI events that are persistent
    this.bindEvents();
  }

  bindEvents() {
    // Navigation
    document.getElementById('prevBtn')?.addEventListener('click', () => this.prevQuestion());
    document.getElementById('nextBtn')?.addEventListener('click', () => this.nextQuestion());
    
    // Review Navigation
    document.getElementById('filterAll')?.addEventListener('click', () => this.filterQuestions('all'));
    document.getElementById('filterWrong')?.addEventListener('click', () => this.filterQuestions('wrong'));
    
    // Exit buttons
    document.getElementById('txtExitReview')?.parentElement.addEventListener('click', () => this.app.showFileScreen());
    document.getElementById('btnTryAgain')?.addEventListener('click', () => this.app.showModeScreen()); 
    document.getElementById('btnReviewAnswers')?.addEventListener('click', () => this.startReview());
    document.getElementById('txtResultsMenu')?.parentElement.addEventListener('click', () => this.app.showFileScreen());
  }

  // --- Start Methods ---

  startPractice(examData, options = {}) {
    this.examData = examData;
    this.mode = "practice";
    this.currentQuestions = [...examData.questions];

    if (options.shuffleQuestions) {
      this.shuffle(this.currentQuestions);
    }

    if (options.shuffleAnswers) {
      this.currentQuestions.forEach((q) => {
        // Clone answers to avoid messing up original data if reference is shared
        q.answers = this.shuffle([...q.answers]);
      });
    }

    this.currentIndex = 0;
    this.userAnswers = {};
    this.showFeedback = options.showFeedback !== false;

    this.app.hideAllScreens();
    document.getElementById("practiceScreen").classList.remove("hidden");
    this.renderQuestion();
  }

  startReview(examData = this.examData) {
    if (!examData) return;
    this.examData = examData;
    this.mode = "review";
    this.currentFilter = "all";
    
    // Restore original order for review if possible, or just use current
    // If we shuffled, we might want to review in original order? 
    // For now, keep current order or filtered.
    // Actually, usually users want to review specific questions.
    // Let's reset to original order for consistent numbering lookup
    this.currentQuestions = [...this.examData.questions];
    this.filteredQuestions = [...this.currentQuestions];
    
    this.currentIndex = 0;

    // Count wrong answers to disable "Falladas" button if none
    const wrongCount = this.currentQuestions.filter(q => !q.wasCorrect).length;

    // Update UI
    const filterAll = document.getElementById("filterAll");
    const filterWrong = document.getElementById("filterWrong");
    if(filterAll) filterAll.classList.add("active");
    if(filterWrong) {
        filterWrong.classList.remove("active");
        // Disable button if no wrong answers
        if (wrongCount === 0) {
            filterWrong.disabled = true;
            filterWrong.classList.add("disabled");
            filterWrong.title = this.app.T?.noWrongAnswers || "No wrong answers to review";
        } else {
            filterWrong.disabled = false;
            filterWrong.classList.remove("disabled");
            filterWrong.title = "";
        }
    }

    this.app.hideAllScreens();
    document.getElementById("reviewScreen").classList.remove("hidden");
    this.renderReviewQuestion();
  }

  // --- Logic ---

  shuffle(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  selectAnswer(answerIndex) {
    // Only allow answering once in practice mode
    if (this.userAnswers[this.currentIndex] !== undefined) return;

    this.userAnswers[this.currentIndex] = answerIndex;

    const q = this.currentQuestions[this.currentIndex];
    const isCorrect = q.answers[answerIndex].isCorrect;
    
    // Save progress via App
    if (this.app.saveProgress) {
        this.app.saveProgress(this.examData.exam_id, q.number, isCorrect);
    }

    if (isCorrect) {
      this.renderQuestion(); // Show feedback
      setTimeout(() => {
        if (this.currentIndex < this.currentQuestions.length - 1) {
          this.currentIndex++;
          this.renderQuestion();
        } else {
          this.showResults();
        }
      }, 500); 
    } else {
      this.renderQuestion(); // Show feedback (red)
    }
  }

  prevQuestion() {
    if (this.currentIndex > 0) {
      this.currentIndex--;
      this.renderQuestion();
    }
  }

  nextQuestion() {
    if (this.currentIndex < this.currentQuestions.length - 1) {
      this.currentIndex++;
      this.renderQuestion();
    } else {
      this.showResults();
    }
  }

  filterQuestions(filter) {
    this.currentFilter = filter;
    const filterAll = document.getElementById("filterAll");
    const filterWrong = document.getElementById("filterWrong");

    if (filter === 'all') {
        filterAll.classList.add("active");
        filterWrong.classList.remove("active");
        this.filteredQuestions = [...this.currentQuestions];
    } else {
        filterAll.classList.remove("active");
        filterWrong.classList.add("active");
        // Filter logic: In review, use original "wasCorrect" OR current session results
        // This logic is a bit complex because userAnswers might be from this session
        // OR from history. 
        // For simplicity: If we have userAnswers, use them. Else use q.wasCorrect (history)
        
        this.filteredQuestions = this.currentQuestions.filter((q, i) => {
             // Find original index if shuffled? 
             // Current Implementation assumes currentQuestions matches userAnswers index mapped
             // But in Review we reset to original order. 
             // We need to map active session answers to question numbers.
             
             // Let's assume userAnswers is keyed by INDEX in currentQuestions.
             // If we reset currentQuestions to original order, we lose that mapping if we shuffled.
             
             // FIX: userAnswers should be map of Question Number -> Answer Index? 
             // Or just use the simple logic: if we just finished practice, userAnswers is by index of THAT session.
             // If we rely on stored progress, we use that.
             
             // Simplification: Check stored progress via App
             const storedResult = this.app.getQuestionResult(this.examData.exam_id, q.number);
             if (storedResult !== null) return !storedResult; // Incorrect
             
             return !q.wasCorrect; // Fallback to original
        });
    }

    this.currentIndex = 0;
    if (this.filteredQuestions.length === 0) {
      alert(this.app.T?.noQuestionsMatch || "No questions match this filter!");
      this.filterQuestions("all");
      return;
    }
    this.renderReviewQuestion();
  }

  // --- Rendering ---

  renderImages(containerId, question) {
    const container = document.getElementById(containerId);
    if(!container) return;
    container.innerHTML = "";
    if (question.images && question.images.length > 0) {
      question.images.forEach((imgUrl) => {
        const img = document.createElement("img");
        img.src = imgUrl;
        img.alt = "Question image";
        img.onerror = () => { img.style.display = "none"; };
        container.appendChild(img);
      });
    }
  }

  renderMinimap(containerId, questions, getCurrentFn) {
    const container = document.getElementById(containerId);
    if(!container) return;
    container.innerHTML = "";

    questions.forEach((q, i) => {
      const div = document.createElement("div");
      div.className = "minimap-item";
      
      // Determine status
      if (this.mode === 'practice') {
          if (this.userAnswers[i] !== undefined) {
              const ans = q.answers[this.userAnswers[i]];
              div.classList.add(ans && ans.isCorrect ? "user-correct" : "user-incorrect");
          } else {
              div.classList.add("unanswered");
          }
      } else {
          // Review mode
          const isCorrect = this.app.getQuestionResult(this.examData.exam_id, q.number) ?? q.wasCorrect;
          div.classList.add(isCorrect ? "was-correct" : "was-incorrect");
      }

      if (i === getCurrentFn()) div.classList.add("current");
      div.textContent = q.number;
      div.onclick = () => {
        this.currentIndex = i;
        this.mode === 'practice' ? this.renderQuestion() : this.renderReviewQuestion();
      };
      container.appendChild(div);
    });
  }

  renderQuestion() {
    const q = this.currentQuestions[this.currentIndex];
    const total = this.currentQuestions.length;
    const T = this.app.T || {};
    
    // Update progress bars and text
    const progBar = document.getElementById("progressBar");
    if(progBar) progBar.style.width = `${(100 * (this.currentIndex + 1)) / total}%`;
    
    const progText = document.getElementById("progressText");
    if(progText) progText.textContent = `${T.question || 'Question'} ${this.currentIndex + 1} ${T.questionOf || 'of'} ${total}`;

    // Status
    const storedRes = this.app.getQuestionResult(this.examData.exam_id, q.number);
    const isCorrect = storedRes ?? q.wasCorrect;
    const statusText = isCorrect ? (T.mastered || "✓ Mastered") : (T.needsPractice || "✗ Needs Practice");
    const statusClass = isCorrect ? "was-correct" : "was-incorrect";
    
    document.getElementById("questionNumber").innerHTML = `${T.question || 'Question'} ${q.number} <span class="question-status ${statusClass}">${statusText}</span>`;
    
    this.renderImages("questionImages", q);
    document.getElementById("questionText").textContent = q.text;
    
    this.renderMinimap("practiceMinimapContainer", this.currentQuestions, () => this.currentIndex);

    // Answers
    const container = document.getElementById("answersContainer");
    container.innerHTML = "";
    
    const hasAnswered = this.userAnswers[this.currentIndex] !== undefined;
    
    q.answers.forEach((ans, i) => {
        const div = document.createElement("div");
        div.className = "answer-option";
        
        if (hasAnswered) {
            if (this.userAnswers[this.currentIndex] === i) {
                div.classList.add("selected");
                if (this.showFeedback) {
                    div.classList.add(ans.isCorrect ? "correct" : "incorrect");
                }
            }
            if (this.showFeedback && ans.isCorrect) {
                div.classList.add("show-correct");
            }
        }
        
        div.innerHTML = `
            <span class="answer-letter">${ans.letter}</span>
            <span class="answer-text">${ans.text}</span>
            ${hasAnswered && this.showFeedback ? 
                (ans.isCorrect ? '<span class="answer-icon">✓</span>' : 
                 (this.userAnswers[this.currentIndex] === i ? '<span class="answer-icon">✗</span>' : '')) 
                 : ''}
        `;
        
        if (!hasAnswered) {
            div.onclick = () => this.selectAnswer(i);
        }
        container.appendChild(div);
    });

    // Nav Buttons
    const prevBtn = document.getElementById("prevBtn");
    if(prevBtn) prevBtn.disabled = this.currentIndex === 0;
    
    const nextBtn = document.getElementById("nextBtn");
    const nextBtnSpan = nextBtn?.querySelector('span');
    if(nextBtn && nextBtnSpan) {
        if (this.currentIndex === total - 1) {
            nextBtnSpan.textContent = T.finish || 'Finish';
            nextBtn.className = "nav-btn finish";
        } else {
            nextBtnSpan.textContent = T.next || 'Next';
            nextBtn.className = "nav-btn next";
        }
    }
  }

  renderReviewQuestion() {
     const q = this.filteredQuestions[this.currentIndex];
     const total = this.filteredQuestions.length;
     
     document.getElementById("reviewProgressBar").style.width = `${(100 * (this.currentIndex + 1)) / total}%`;
     const T = this.app.T || {};
     document.getElementById("reviewProgressText").textContent = `${T.question || 'Question'} ${this.currentIndex + 1} ${T.questionOf || 'of'} ${total}`;
     document.getElementById("reviewQuestionNumber").textContent = `${T.question || 'Question'} ${q.number}`;
     
     this.renderImages("reviewQuestionImages", q);
     document.getElementById("reviewQuestionText").textContent = q.text;
     
     // Correct answer text
     const correctAns = q.answers.find(a => a.isCorrect);
     document.getElementById("correctAnswerText").textContent = correctAns ? correctAns.text : (this.app.T.unknown || "Unknown");
     
     // Minimap
     // Find index in ORIGINAL list for minimap highlight
     const originalList = this.currentQuestions; // In Review these are all questions
     this.renderMinimap("reviewMinimapContainer", originalList, () => {
         return originalList.findIndex(oq => oq.number === q.number);
     });
     
     // Answers
     const container = document.getElementById("reviewAnswersContainer");
     container.innerHTML = "";
     
     // Determine what user answered (if anything)
     // Complex: userAnswers index mismatch if shuffled.
     // For now in Review Mode we just show the correct answer clearly.
     
     q.answers.forEach((ans) => {
         const div = document.createElement("div");
         div.className = "answer-option";
         
         if (ans.isCorrect) {
             div.classList.add("correct");
             div.innerHTML = `
                <span class="answer-letter">${ans.letter}</span>
                <span class="answer-text">${ans.text}</span>
                <span class="answer-icon">✓</span>
             `;
         } else {
             div.innerHTML = `
                <span class="answer-letter">${ans.letter}</span>
                <span class="answer-text">${ans.text}</span>
             `;
         }
         container.appendChild(div);
     });
  }

  async showResults() {
    this.app.hideAllScreens();
    document.getElementById("resultsScreen").classList.remove("hidden");
    
    let correct = 0;
    const total = this.currentQuestions.length;
    
    // Calculate score based on this session
    Object.keys(this.userAnswers).forEach(idx => {
        const q = this.currentQuestions[idx];
        const ansIdx = this.userAnswers[idx];
        if (q.answers[ansIdx] && q.answers[ansIdx].isCorrect) {
            correct++;
        }
    });

    const pct = total > 0 ? Math.round((100 * correct) / total) : 0;
    const T = this.app.T || {};
    
    // Update score circle
    const scoreCircle = document.getElementById("scoreCircle");
    const scoreEl = document.getElementById("finalScore");
    scoreEl.textContent = `${pct}%`;
    scoreCircle.className = `score-circle ${pct >= 70 ? 'good' : pct >= 50 ? 'medium' : 'bad'}`;
    scoreCircle.style.setProperty('--score-percent', `${pct}%`);
    
    document.getElementById("scoreDetails").textContent = `${correct} ${T.correctOutOf || 'correct out of'} ${total}`;
    
    // Save score and update comparison (must await to prevent race condition)
    const scoreData = await this.app.saveScore(this.examData.exam_id, pct);
    this.updateScoreComparison(scoreData, T);
    
    // Increment attempt counter (after saveScore to prevent overwriting)
    await this.app.incrementAttempt(this.examData.exam_id);
    
    // Review Summary
    const summary = document.getElementById("reviewSummary");
    summary.innerHTML = "";
    
    this.currentQuestions.forEach((q, i) => {
        const div = document.createElement("div");
        div.className = "review-item";
        div.textContent = q.number;
        
        // Status in this session
        if (this.userAnswers[i] !== undefined) {
            const isCorr = q.answers[this.userAnswers[i]].isCorrect;
            div.classList.add(isCorr ? "correct" : "incorrect");
        } else {
            div.classList.add("unanswered");
        }
        
        div.onclick = () => {
            this.startReview();
            // Try to find this question in review list
            const reviewIdx = this.filteredQuestions.findIndex(fq => fq.number === q.number);
            if (reviewIdx !== -1) {
                this.currentIndex = reviewIdx;
                this.renderReviewQuestion();
            }
        };
        summary.appendChild(div);
    });
  }
  
  updateScoreComparison(scoreData, T) {
    const lastScoreEl = document.getElementById("lastScoreValue");
    const bestScoreEl = document.getElementById("bestScoreValue");
    
    const lastScore = scoreData?.lastScore;
    const bestScore = scoreData?.bestScore;
    
    if (lastScoreEl) {
        lastScoreEl.textContent = (lastScore !== null && lastScore !== undefined) ? `${lastScore}%` : (T.notAttempted || '-');
    }
    if (bestScoreEl) {
        bestScoreEl.textContent = (bestScore !== null && bestScore !== undefined) ? `${bestScore}%` : (T.notAttempted || '-');
    }
  }
}
window.PracticeManager = PracticeManager;
