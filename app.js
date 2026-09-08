(() => {
    // State
    let workout = []; // { type: 'exercise'|'break', name: string, duration: number }
    let currentIndex = 0;
    let timeLeft = 0;
    let totalDuration = 0;
    let timerInterval = null;
    let isRunning = false;
    let isPaused = false;
    let audioCtx = null;
    let presets = {}; // { presetName: workoutArray }
    const STORAGE_KEY = 'exerciseTimerPresets';
    const DURATIONS_KEY = 'exerciseTimerDurations';

    // Load presets from localStorage
    function loadPresets() {
        try {
            const data = localStorage.getItem(STORAGE_KEY);
            if (data) presets = JSON.parse(data);
        } catch (e) { presets = {}; }
    }

    function savePresetsToStorage() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(presets)); } catch (e) {}
    }

    function loadDurations() {
        try {
            const data = localStorage.getItem(DURATIONS_KEY);
            if (data) {
                const d = JSON.parse(data);
                exerciseDuration.value = d.exerciseMin ?? 1;
                exerciseDurationSec.value = d.exerciseSec ?? 0;
                breakDuration.value = d.breakMin ?? 0;
                breakDurationSec.value = d.breakSec ?? 30;
            }
        } catch (e) {}
    }

    function saveDurations() {
        try {
            localStorage.setItem(DURATIONS_KEY, JSON.stringify({
                exerciseMin: exerciseDuration.value,
                exerciseSec: exerciseDurationSec.value,
                breakMin: breakDuration.value,
                breakSec: breakDurationSec.value
            }));
        } catch (e) {}
    }

    // DOM
    const exerciseName = document.getElementById('exerciseName');
    const exerciseDuration = document.getElementById('exerciseDuration');
    const exerciseDurationSec = document.getElementById('exerciseDurationSec');
    const addExerciseBtn = document.getElementById('addExerciseBtn');
    const addBreakBtn = document.getElementById('addBreakBtn');
    const loadSampleBtn = document.getElementById('loadSampleBtn');
    const clearAllBtn = document.getElementById('clearAllBtn');
    const workoutList = document.getElementById('workoutList');
    const timerLabel = document.getElementById('timerLabel');
    const timerTime = document.getElementById('timerTime');
    const timerProgressBar = document.getElementById('timerProgressBar');
    const nextUp = document.getElementById('nextUp');
    const startBtn = document.getElementById('startBtn');
    const pauseBtn = document.getElementById('pauseBtn');
    const resetBtn = document.getElementById('resetBtn');
    const soundToggle = document.getElementById('soundToggle');
    const savePresetBtn = document.getElementById('savePresetBtn');
    const presetsList = document.getElementById('presetsList');
    const exerciseCount = document.getElementById('exerciseCount');
    const breakDuration = document.getElementById('breakDuration');
    const breakDurationSec = document.getElementById('breakDurationSec');
    const importPresetsBtn = document.getElementById('importPresetsBtn');
    const importFileInput = document.getElementById('importFileInput');
    const fullscreenBtn = document.getElementById('fullscreenBtn');
    const timerPanel = document.getElementById('timerPanel');
    const volumeSlider = document.getElementById('volumeSlider');
    const volumeValue = document.getElementById('volumeValue');

    // Audio context
    function getAudioCtx() {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        return audioCtx;
    }

    function playBeep(freq, duration, type = 'sine') {
        if (!soundToggle.checked) return;
        try {
            const ctx = getAudioCtx();
            const vol = (volumeSlider.value / 100) * 0.3;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = type;
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(vol, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + duration);
        } catch (e) {}
    }

    function playRichTone(freq, duration, type = 'sine', detune = 0) {
        if (!soundToggle.checked) return;
        try {
            const ctx = getAudioCtx();
            const vol = (volumeSlider.value / 100) * 0.3;
            const osc = ctx.createOscillator();
            const osc2 = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = type;
            osc.frequency.value = freq;
            osc2.type = type;
            osc2.frequency.value = freq;
            osc2.detune.value = detune;
            gain.gain.setValueAtTime(vol, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
            osc.connect(gain);
            osc2.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime);
            osc2.start(ctx.currentTime);
            osc.stop(ctx.currentTime + duration);
            osc2.stop(ctx.currentTime + duration);
        } catch (e) {}
    }

    function playSweep(startFreq, endFreq, duration, type = 'sine') {
        if (!soundToggle.checked) return;
        try {
            const ctx = getAudioCtx();
            const vol = (volumeSlider.value / 100) * 0.3;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(startFreq, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(endFreq, ctx.currentTime + duration);
            gain.gain.setValueAtTime(vol, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + duration);
        } catch (e) {}
    }

    function playNoise(duration) {
        if (!soundToggle.checked) return;
        try {
            const ctx = getAudioCtx();
            const vol = (volumeSlider.value / 100) * 0.08;
            const bufferSize = ctx.sampleRate * duration;
            const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
            }
            const source = ctx.createBufferSource();
            source.buffer = buffer;
            const gain = ctx.createGain();
            gain.gain.setValueAtTime(vol, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
            source.connect(gain);
            gain.connect(ctx.destination);
            source.start(ctx.currentTime);
        } catch (e) {}
    }

    function playTransitionSound() {
        playNoise(0.08);
        playRichTone(660, 0.12, 'sine', 5);
        setTimeout(() => playRichTone(880, 0.12, 'sine', -5), 80);
        setTimeout(() => {
            playSweep(1000, 1400, 0.25, 'sine');
            playRichTone(1320, 0.3, 'triangle', 8);
        }, 180);
    }

    function playBreakSound() {
        playNoise(0.06);
        playRichTone(392, 0.25, 'sine', 3);
        setTimeout(() => playRichTone(494, 0.25, 'sine', -3), 150);
        setTimeout(() => {
            playSweep(587, 784, 0.35, 'triangle');
            playRichTone(659, 0.35, 'sine', 6);
        }, 320);
    }

    function playCountdownBeep() {
        playSweep(500, 300, 0.12, 'square');
        playRichTone(440, 0.1, 'sawtooth', 2);
    }

    function playFinishSound() {
        playNoise(0.1);
        playRichTone(523, 0.18, 'sine', 4);
        setTimeout(() => playRichTone(659, 0.18, 'sine', -4), 150);
        setTimeout(() => {
            playRichTone(784, 0.18, 'triangle', 6);
            playSweep(700, 900, 0.2, 'sine');
        }, 300);
        setTimeout(() => {
            playRichTone(1047, 0.5, 'sine', -3);
            playSweep(1000, 1500, 0.5, 'triangle');
            playNoise(0.15);
        }, 480);
    }

    // Helpers
    function formatTime(seconds) {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    function getTotalWorkoutDuration() {
        return workout.reduce((sum, item) => sum + item.duration, 0);
    }

    // Render workout list
    function renderWorkoutList() {
        workoutList.innerHTML = '';

        const exerciseCountValue = workout.filter(i => i.type === 'exercise').length;
        const breakCountValue = workout.filter(i => i.type === 'break').length;
        const parts = [];
        if (exerciseCountValue > 0) parts.push(`${exerciseCountValue} exercise${exerciseCountValue !== 1 ? 's' : ''}`);
        if (breakCountValue > 0) parts.push(`${breakCountValue} break${breakCountValue !== 1 ? 's' : ''}`);
        exerciseCount.textContent = parts.length > 0 ? parts.join(', ') : '';

        if (workout.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'workout-empty';
            empty.innerHTML = '<span class="workout-empty-icon">&#128170;</span><span>No exercises yet.<br>Add one above to build your workout.</span>';
            workoutList.appendChild(empty);
            updateTimerDisplay();
            return;
        }

        workout.forEach((item, i) => {
            const div = document.createElement('div');
            div.className = `workout-item ${item.type}`;
            div.dataset.index = i;
            div.draggable = true;
            div.innerHTML = `
                <span class="item-drag" title="Drag to reorder">⠿</span>
                <span class="item-num">${i + 1}</span>
                <span class="item-name">${item.type === 'break' ? '☕ Break' : item.name}</span>
                <span class="item-duration">${formatTime(item.duration)}</span>
                <button class="item-duplicate" data-index="${i}" title="Duplicate">&#10697;</button>
                <button class="item-edit" data-index="${i}" title="Edit">&#9998;</button>
                <button class="item-remove" data-index="${i}" title="Remove">&times;</button>
            `;
            workoutList.appendChild(div);
        });

        workoutList.querySelectorAll('.item-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.target.dataset.index);
                workout.splice(idx, 1);
                renderWorkoutList();
                updateTimerDisplay();
            });
        });

        workoutList.querySelectorAll('.item-edit').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.target.dataset.index);
                editItem(idx);
            });
        });

        workoutList.querySelectorAll('.item-duplicate').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.target.dataset.index);
                const clone = JSON.parse(JSON.stringify(workout[idx]));
                workout.splice(idx + 1, 0, clone);
                renderWorkoutList();
                updateTimerDisplay();
            });
        });

        // Drag and drop reordering
        let dragIdx = null;
        workoutList.querySelectorAll('.workout-item').forEach(item => {
            item.addEventListener('dragstart', (e) => {
                if (workoutList.querySelector('.editing')) {
                    e.preventDefault();
                    return;
                }
                dragIdx = parseInt(item.dataset.index);
                item.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
            });
            item.addEventListener('dragend', () => {
                item.classList.remove('dragging');
                dragIdx = null;
                workoutList.querySelectorAll('.workout-item').forEach(el => el.classList.remove('drag-over'));
            });
            item.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                const overIdx = parseInt(item.dataset.index);
                if (overIdx !== dragIdx) {
                    item.classList.add('drag-over');
                }
            });
            item.addEventListener('dragleave', () => {
                item.classList.remove('drag-over');
            });
            item.addEventListener('drop', (e) => {
                e.preventDefault();
                const fromIdx = dragIdx;
                const toIdx = parseInt(item.dataset.index);
                if (fromIdx === null || fromIdx === toIdx) return;
                const moved = workout.splice(fromIdx, 1)[0];
                workout.splice(toIdx, 0, moved);
                renderWorkoutList();
            });
        });

        updateTimerDisplay();
    }

    function editItem(idx) {
        if (isRunning) return;
        const item = workout[idx];
        const div = workoutList.children[idx];
        const isBreak = item.type === 'break';
        const durMin = Math.floor(item.duration / 60);
        const durSec = item.duration % 60;

        div.classList.add('editing');
        div.innerHTML = `
            <span class="item-num">${idx + 1}</span>
            <input type="text" class="edit-name" value="${isBreak ? '' : item.name}" placeholder="Exercise name" ${isBreak ? 'disabled' : ''}>
            <div class="duration-clock">
                <input type="number" class="edit-min" value="${durMin}" min="0" max="60">
                <span class="duration-sep">:</span>
                <input type="number" class="edit-sec" value="${durSec}" min="0" max="59">
            </div>
            <button class="edit-save" title="Save">&#10003;</button>
            <button class="edit-cancel" title="Cancel">&times;</button>
        `;

        const nameInput = div.querySelector('.edit-name');
        const minInput = div.querySelector('.edit-min');
        const secInput = div.querySelector('.edit-sec');
        const saveBtn = div.querySelector('.edit-save');
        const cancelBtn = div.querySelector('.edit-cancel');

        if (!isBreak) nameInput.focus();
        else minInput.focus();

        function save() {
            const newName = isBreak ? 'Break' : nameInput.value.trim();
            if (!isBreak && !newName) { nameInput.focus(); return; }
            const newMin = parseInt(minInput.value) || 0;
            const newSec = parseInt(secInput.value) || 0;
            const newDur = newMin * 60 + newSec;
            if (newDur <= 0) return;
            workout[idx].name = newName;
            workout[idx].duration = newDur;
            renderWorkoutList();
        }

        function cancel() { renderWorkoutList(); }

        saveBtn.addEventListener('click', save);
        cancelBtn.addEventListener('click', cancel);
        nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel(); });
        minInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel(); });
        secInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel(); });
    }

    // Presets
    function renderPresets() {
        presetsList.innerHTML = '';
        const names = Object.keys(presets);
        if (names.length === 0) {
            presetsList.innerHTML = '<div class="presets-empty">No saved presets yet</div>';
            return;
        }
        names.forEach(name => {
            const div = document.createElement('div');
            div.className = 'preset-item';
            const count = presets[name].length;
            div.innerHTML = `
                <span class="preset-name">${name}</span>
                <span class="preset-count">${count} item${count !== 1 ? 's' : ''}</span>
                <button class="preset-load" data-name="${name}">Load</button>
                <button class="preset-export" data-name="${name}" title="Export this preset">Export</button>
                <button class="preset-delete" data-name="${name}">&times;</button>
            `;
            presetsList.appendChild(div);
        });

        presetsList.querySelectorAll('.preset-load').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const name = e.target.dataset.name;
                if (isRunning) resetTimer();
                workout = JSON.parse(JSON.stringify(presets[name]));
                renderWorkoutList();
            });
        });

        presetsList.querySelectorAll('.preset-export').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const name = e.target.dataset.name;
                const data = JSON.stringify({ [name]: presets[name] }, null, 2);
                const blob = new Blob([data], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `preset-${name}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            });
        });

        presetsList.querySelectorAll('.preset-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const name = e.target.dataset.name;
                if (confirm(`Delete preset "${name}"?`)) {
                    delete presets[name];
                    savePresetsToStorage();
                    renderPresets();
                }
            });
        });
    }

    function savePreset() {
        if (workout.length === 0) return;
        const name = prompt('Preset name:');
        if (!name || !name.trim()) return;
        presets[name.trim()] = JSON.parse(JSON.stringify(workout));
        savePresetsToStorage();
        renderPresets();
    }

    function importPresets() {
        importFileInput.click();
    }

    importFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const imported = JSON.parse(ev.target.result);
                if (typeof imported !== 'object' || Array.isArray(imported)) {
                    alert('Invalid preset file format.');
                    return;
                }
                const count = Object.keys(imported).length;
                if (count === 0) {
                    alert('No presets found in file.');
                    return;
                }
                if (confirm(`Import ${count} preset${count !== 1 ? 's' : ''}? This will add to your existing presets.`)) {
                    Object.assign(presets, imported);
                    savePresetsToStorage();
                    renderPresets();
                }
            } catch (err) {
                alert('Failed to parse preset file. Make sure it is a valid JSON file.');
            }
        };
        reader.readAsText(file);
        importFileInput.value = '';
    });

    // Timer display
    function updateTimerDisplay() {
        if (workout.length === 0) {
            timerLabel.textContent = 'Ready';
            timerLabel.className = 'timer-label';
            timerTime.textContent = '00:00';
            timerProgressBar.style.width = '0%';
            nextUp.textContent = 'Add exercises to begin';
            return;
        }

        const total = getTotalWorkoutDuration();
        timerTime.textContent = formatTime(total);
        timerLabel.textContent = 'Ready';
        timerLabel.className = 'timer-label';
        timerProgressBar.style.width = '0%';
        nextUp.textContent = `${workout.length} items in queue`;
    }

    function renderRunningState() {
        if (currentIndex >= workout.length) return;

        const item = workout[currentIndex];
        const isBreak = item.type === 'break';
        const newText = isBreak ? 'Break' : item.name;

        timerLabel.textContent = newText;
        timerLabel.className = `timer-label running ${isBreak ? 'break-label' : ''}`;
        timerTime.textContent = formatTime(timeLeft);

        const elapsed = totalDuration - timeLeft;
        const progress = totalDuration > 0 ? (elapsed / totalDuration) * 100 : 0;
        timerProgressBar.style.width = `${progress}%`;
        timerProgressBar.className = `timer-progress-bar ${isBreak ? 'break-bar' : ''}`;

        // Next up
        if (currentIndex + 1 < workout.length) {
            const next = workout[currentIndex + 1];
            nextUp.textContent = `Next: ${next.type === 'break' ? 'Break' : next.name} (${formatTime(next.duration)})`;
        } else {
            nextUp.textContent = 'Last item!';
        }
    }

    // Timer controls
    function startTimer() {
        if (workout.length === 0) return;

        if (isPaused) {
            isPaused = false;
            isRunning = true;
            timerInterval = setInterval(tick, 1000);
            startBtn.disabled = true;
            pauseBtn.disabled = false;
            resetBtn.disabled = false;
            renderRunningState();
            return;
        }

        currentIndex = 0;
        totalDuration = workout[0].duration;
        timeLeft = totalDuration;
        isRunning = true;
        isPaused = false;

        startBtn.disabled = true;
        pauseBtn.disabled = false;
        resetBtn.disabled = false;

        playTransitionSound();
        renderRunningState();

        timerInterval = setInterval(tick, 1000);
    }

    function pauseTimer() {
        if (!isRunning) return;
        clearInterval(timerInterval);
        isRunning = false;
        isPaused = true;

        startBtn.disabled = false;
        pauseBtn.disabled = true;

        timerLabel.textContent = 'Paused';
        timerLabel.className = 'timer-label paused';
    }

    function resetTimer() {
        clearInterval(timerInterval);
        isRunning = false;
        isPaused = false;
        currentIndex = 0;

        startBtn.disabled = false;
        pauseBtn.disabled = true;
        resetBtn.disabled = true;

        renderWorkoutList();
    }

    function tick() {
        if (timeLeft <= 3 && timeLeft > 0) {
            playCountdownBeep();
        }

        timeLeft--;

        if (timeLeft <= 0) {
            currentIndex++;

            if (currentIndex >= workout.length) {
                // Workout done
                clearInterval(timerInterval);
                isRunning = false;
                isPaused = false;

                timerLabel.textContent = 'Done!';
                timerLabel.className = 'timer-label running';
                timerTime.textContent = '00:00';
                timerProgressBar.style.width = '100%';
                nextUp.textContent = 'Great workout!';
                startBtn.disabled = false;
                pauseBtn.disabled = true;
                resetBtn.disabled = true;

                playFinishSound();
                timerTime.classList.add('flash');
                setTimeout(() => timerTime.classList.remove('flash'), 2000);
                return;
            }

            // Transition to next item
            const prevItem = workout[currentIndex - 1];
            const nextItem = workout[currentIndex];
            totalDuration = nextItem.duration;
            timeLeft = totalDuration;

            if (nextItem.type === 'break') {
                playBreakSound();
            } else {
                playTransitionSound();
            }

            timerTime.classList.add('flash');
            setTimeout(() => timerTime.classList.remove('flash'), 600);
        }

        renderRunningState();
    }

    // Event listeners
    addExerciseBtn.addEventListener('click', () => {
        const name = exerciseName.value.trim();
        if (!name) {
            exerciseName.focus();
            return;
        }
        const min = parseInt(exerciseDuration.value) || 0;
        const sec = parseInt(exerciseDurationSec.value) || 0;
        const duration = min * 60 + sec;
        if (duration <= 0) return;

        workout.push({ type: 'exercise', name, duration });
        exerciseName.value = '';
        renderWorkoutList();
    });

    addBreakBtn.addEventListener('click', () => {
        const min = parseInt(breakDuration.value) || 0;
        const sec = parseInt(breakDurationSec.value) || 0;
        const duration = min * 60 + sec;
        if (duration <= 0) return;

        workout.push({ type: 'break', name: 'Break', duration });
        renderWorkoutList();
    });

    exerciseName.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') addExerciseBtn.click();
    });

    exerciseDuration.addEventListener('change', saveDurations);
    exerciseDurationSec.addEventListener('change', saveDurations);
    breakDuration.addEventListener('change', saveDurations);
    breakDurationSec.addEventListener('change', saveDurations);

    volumeSlider.addEventListener('input', () => {
        volumeValue.textContent = volumeSlider.value + '%';
        try { localStorage.setItem('exerciseTimerVolume', volumeSlider.value); } catch (e) {}
    });

    // Load saved volume
    try {
        const savedVol = localStorage.getItem('exerciseTimerVolume');
        if (savedVol !== null) {
            volumeSlider.value = savedVol;
            volumeValue.textContent = savedVol + '%';
        }
    } catch (e) {}

    loadSampleBtn.addEventListener('click', () => {
        workout = [
            { type: 'exercise', name: 'Lunges+', duration: 240 },
            { type: 'break', name: 'Break', duration: 30 },
            { type: 'exercise', name: 'Pushups', duration: 180 },
            { type: 'break', name: 'Break', duration: 30 },
            { type: 'exercise', name: 'Squats + HKJ', duration: 60 },
            { type: 'break', name: 'Break', duration: 30 },
            { type: 'exercise', name: 'Plank', duration: 120 },
            { type: 'break', name: 'Break', duration: 30 },
            { type: 'exercise', name: 'SL + Plyo', duration: 240 },
            { type: 'break', name: 'Break', duration: 30 },
            { type: 'exercise', name: 'Burpee + Side Plank', duration: 120 },
            { type: 'break', name: 'Break', duration: 30 },
            { type: 'exercise', name: 'Toe Tip Crunches + Russian Twists', duration: 180 },
        ];
        renderWorkoutList();
    });

    clearAllBtn.addEventListener('click', () => {
        if (isRunning) resetTimer();
        workout = [];
        renderWorkoutList();
    });

    savePresetBtn.addEventListener('click', savePreset);
    importPresetsBtn.addEventListener('click', importPresets);

    startBtn.addEventListener('click', startTimer);
    pauseBtn.addEventListener('click', pauseTimer);
    resetBtn.addEventListener('click', resetTimer);

    function toggleFullscreen() {
        if (!document.fullscreenElement && !document.webkitFullscreenElement) {
            const el = timerPanel;
            if (el.requestFullscreen) el.requestFullscreen();
            else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
        } else {
            if (document.exitFullscreen) document.exitFullscreen();
            else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        }
    }

    fullscreenBtn.addEventListener('click', toggleFullscreen);

    document.addEventListener('fullscreenchange', updateFullscreenBtn);
    document.addEventListener('webkitfullscreenchange', updateFullscreenBtn);

    function updateFullscreenBtn() {
        const isFS = !!(document.fullscreenElement || document.webkitFullscreenElement);
        fullscreenBtn.textContent = isFS ? '⛶' : '⛶';
        fullscreenBtn.title = isFS ? 'Exit Fullscreen' : 'Fullscreen';
        timerPanel.classList.toggle('is-fullscreen', isFS);
    }

    // Init
    loadPresets();
    loadDurations();
    renderWorkoutList();
    renderPresets();
})();
