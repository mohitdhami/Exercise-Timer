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
    let wakeLock = null; // Screen Wake Lock: held only while the timer runs
    let keepAwakeVideo = null; // Fallback for browsers without Wake Lock API
    let presets = {}; // { presetName: workoutArray }
    const STORAGE_KEY = 'exerciseTimerPresets';
    const DURATIONS_KEY = 'exerciseTimerDurations';
    const WORKOUT_KEY = 'exerciseTimerWorkout';
    const LAST_PRESET_KEY = 'exerciseTimerLastPreset';
    let activePresetName = null; // preset currently loaded in the builder (null = custom/modified)

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

    function sanitizeWorkoutItem(it) {
        if (!it || typeof it !== 'object') return null;
        const type = it.type === 'break' ? 'break' : it.type === 'exercise' ? 'exercise' : null;
        if (!type) return null;
        const duration = Math.floor(Number(it.duration));
        if (!Number.isFinite(duration) || duration <= 0 || duration > 3600) return null;
        if (type === 'break') return { type, name: 'Break', duration };
        const name = typeof it.name === 'string' ? it.name.trim().slice(0, 100) : '';
        if (!name) return null;
        return { type, name, duration };
    }

    // Persist the current builder workout so it survives app restart.
    function saveWorkoutToStorage() {
        try { localStorage.setItem(WORKOUT_KEY, JSON.stringify(workout)); } catch (e) {}
    }

    function loadWorkoutFromStorage() {
        try {
            const raw = localStorage.getItem(WORKOUT_KEY);
            if (!raw) return false;
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return false;
            const clean = parsed.map(sanitizeWorkoutItem).filter(Boolean);
            // If storage held items but none are valid, treat as no usable data.
            if (parsed.length > 0 && clean.length === 0) return false;
            workout = clean;
            return true;
        } catch (e) { workout = []; return false; }
    }

    function loadActivePresetName() {
        try {
            const name = localStorage.getItem(LAST_PRESET_KEY);
            if (name && presets[name]) activePresetName = name;
            else activePresetName = null;
        } catch (e) { activePresetName = null; }
    }

    function setActivePreset(name) {
        activePresetName = name;
        try {
            if (name) localStorage.setItem(LAST_PRESET_KEY, name);
            else localStorage.removeItem(LAST_PRESET_KEY);
        } catch (e) {}
        renderPresets();
    }

    // Any manual edit diverges the builder from the loaded preset.
    function clearActivePreset() {
        if (activePresetName === null) return;
        activePresetName = null;
        try { localStorage.removeItem(LAST_PRESET_KEY); } catch (e) {}
        renderPresets();
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
    const adjustBtns = Array.from(document.querySelectorAll('.btn-adjust'));
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');

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
            saveWorkoutToStorage();
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
                clearActivePreset();
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
                clearActivePreset();
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
                clearActivePreset();
                renderWorkoutList();
            });
        });

        saveWorkoutToStorage();
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
            clearActivePreset();
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
            div.className = 'preset-item' + (name === activePresetName ? ' active' : '');
            const count = presets[name].length;
            const isActive = name === activePresetName;
            div.innerHTML = `
                <span class="preset-name">${name}</span>
                <span class="preset-count">${count} item${count !== 1 ? 's' : ''}</span>
                <button class="preset-load" data-name="${name}"${isActive ? ' disabled title="Currently loaded"' : ''}>${isActive ? '✓ Loaded' : 'Load'}</button>
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
                activePresetName = name;
                try { localStorage.setItem(LAST_PRESET_KEY, name); } catch (err) {}
                renderWorkoutList();
                renderPresets();
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
                    if (name === activePresetName) {
                        activePresetName = null;
                        try { localStorage.removeItem(LAST_PRESET_KEY); } catch (err) {}
                    }
                    renderPresets();
                }
            });
        });
    }

    function savePreset() {
        if (workout.length === 0) return;
        const name = prompt('Preset name:');
        if (!name || !name.trim()) return;
        const trimmed = name.trim();
        presets[trimmed] = JSON.parse(JSON.stringify(workout));
        savePresetsToStorage();
        setActivePreset(trimmed);
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
            updateAdjustControls();
            return;
        }

        const total = getTotalWorkoutDuration();
        timerTime.textContent = formatTime(total);
        timerLabel.textContent = 'Ready';
        timerLabel.className = 'timer-label';
        timerProgressBar.style.width = '0%';
        nextUp.textContent = `${workout.length} items in queue`;
        updateAdjustControls();
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
        const rawProgress = totalDuration > 0 ? (elapsed / totalDuration) * 100 : 0;
        const progress = Math.min(100, Math.max(0, rawProgress));
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

    // Manual time adjustment (+/-) and sub-activity shifting (prev/next).
    // Only the current interval's remaining time is changed; workout[] stays
    // intact so the rest of the regimen keeps its planned durations.
    // +/- is capped at the current item's predefined duration and can never
    // extend a sub-activity beyond it.
    function getPredefinedLimit() {
        if (currentIndex < 0 || currentIndex >= workout.length) return 0;
        return workout[currentIndex].duration;
    }

    function hasActiveInterval() {
        return (isRunning || isPaused) && workout.length > 0 && currentIndex < workout.length;
    }

    function updateAdjustControls() {
        const active = hasActiveInterval();
        const limit = active ? getPredefinedLimit() : 0;
        const atMax = active && timeLeft >= limit;
        adjustBtns.forEach(btn => {
            if (!active) {
                btn.disabled = true;
                return;
            }
            const delta = parseInt(btn.dataset.adjust, 10) || 0;
            // "+" buttons do nothing past the predefined limit: disable at cap.
            btn.disabled = delta > 0 && atMax;
        });
        prevBtn.disabled = !active;
        nextBtn.disabled = !active;
    }

    // Refresh time + progress after a manual change without losing Paused state.
    function refreshAfterManualChange() {
        markTick();
        updateAdjustControls();
        if (isPaused) {
            timerTime.textContent = formatTime(timeLeft);
            const elapsed = totalDuration - timeLeft;
            const rawProgress = totalDuration > 0 ? (elapsed / totalDuration) * 100 : 0;
            timerProgressBar.style.width = `${Math.min(100, Math.max(0, rawProgress))}%`;
            // Keep "Paused" label; just refresh next-up text.
            if (currentIndex + 1 < workout.length) {
                const next = workout[currentIndex + 1];
                nextUp.textContent = `Next: ${next.type === 'break' ? 'Break' : next.name} (${formatTime(next.duration)})`;
            } else {
                nextUp.textContent = 'Last item!';
            }
            return;
        }
        renderRunningState();
    }

    function finishWorkout() {
        clearInterval(timerInterval);
        isRunning = false;
        isPaused = false;

        releaseWakeLock();

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
        updateAdjustControls();
    }

    function goToNextInterval(playSound = true) {
        const nextItem = workout[currentIndex];
        totalDuration = nextItem.duration;
        timeLeft = totalDuration;
        markTick();

        if (playSound) {
            if (nextItem.type === 'break') {
                playBreakSound();
            } else {
                playTransitionSound();
            }
            timerTime.classList.add('flash');
            setTimeout(() => timerTime.classList.remove('flash'), 600);
        }
        updateAdjustControls();
    }

    function adjustTime(delta) {
        if (!hasActiveInterval()) return;
        const limit = getPredefinedLimit();
        // Lock the interval total to its predefined duration so +/- can never
        // stretch a sub-activity beyond what was planned.
        totalDuration = limit;
        timeLeft += delta;
        if (timeLeft < 0) timeLeft = 0;
        if (timeLeft > limit) timeLeft = limit;

        if (timeLeft <= 0) {
            // Manual skip: behave like the timer naturally expiring.
            currentIndex++;
            if (currentIndex >= workout.length) {
                finishWorkout();
                return;
            }
            goToNextInterval(!isPaused);
        }
        refreshAfterManualChange();
    }

    // Shift to another sub-activity (prev/next interval) mid-run.
    // Restarts the target interval at its full predefined duration.
    function shiftInterval(direction) {
        if (!hasActiveInterval()) return;
        const newIndex = currentIndex + direction;
        if (newIndex < 0) {
            // Already on the first interval: restart it.
            currentIndex = 0;
            goToNextInterval(false);
            refreshAfterManualChange();
            return;
        }
        if (newIndex >= workout.length) {
            // Shifted past the last interval: finish like a natural expiry.
            finishWorkout();
            return;
        }
        currentIndex = newIndex;
        goToNextInterval(!isPaused);
        refreshAfterManualChange();
    }

    // Screen Wake Lock — keeps the display on while the timer runs.
    // Released on pause/reset/finish.
    //
    // iOS specifics (why the old code failed):
    // - iOS < 16.4 has NO navigator.wakeLock at all.
    // - iOS 16.4+ has it, but it does NOT work in Home Screen web apps
    //   (webkit bug 254545) and is unreliable in WKWebView (which ALL iOS
    //   browsers — Safari, Chrome, Edge, Firefox — must use).
    // - The old fallback (canvas.captureStream -> hidden muted video) does
    //   NOT reliably prevent iOS sleep. The proven NoSleep.js technique is a
    //   looping MP4 *with a silent audio track*, kept in the DOM and nudged
    //   if iOS stalls its playhead. So on iOS we ALWAYS run the video
    //   fallback alongside native Wake Lock; elsewhere video is a backup.
    const NO_SLEEP_MP4 = "data:video/mp4;base64,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";
    let noSleepVideo = null;
    let noSleepWatchdog = null;
    let lastNoSleepTime = -1;
    // Wall-clock anchor for drift-resistant ticking (iOS throttles timers).
    let lastTickAt = 0;

    function isIOSDevice() {
        try {
            if (/iPad|iPhone|iPod/.test(navigator.userAgent)) return true;
            // iPadOS 13+ reports as MacIntel with touch points.
            if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) return true;
        } catch (e) {}
        return false;
    }

    function hasNativeWakeLock() {
        try { return 'wakeLock' in navigator && !!navigator.wakeLock; } catch (e) { return false; }
    }

    function ensureNoSleepVideo() {
        try {
            if (noSleepVideo) {
                if (!noSleepVideo.isConnected) document.body.appendChild(noSleepVideo);
                return noSleepVideo;
            }
            const video = document.createElement('video');
            video.setAttribute('title', 'No Sleep');
            video.setAttribute('playsinline', '');
            video.setAttribute('preload', 'auto');
            // Keep parity with variable name used elsewhere.
            keepAwakeVideo = video;
            noSleepVideo = video;
            const source = document.createElement('source');
            source.src = NO_SLEEP_MP4;
            source.type = 'video/mp4';
            video.appendChild(source);
            // Tiny but *visible* to iOS (opacity:0 / display:none get optimised
            // away and stop preventing sleep on some iOS versions).
            video.style.cssText = 'position:fixed;bottom:0;left:0;width:16px;height:16px;opacity:0.01;pointer-events:none;z-index:-1;';
            video.loop = false; // MP4 path uses timeupdate trick (see below), not loop.
            video.muted = false;
            // NoSleep.js MP4 trick: duration > 1, so rewind before the end to loop forever.
            video.addEventListener('timeupdate', () => {
                try {
                    if (video.currentTime > 0.5) video.currentTime = Math.random() * 0.4;
                } catch (e) {}
            });
            video.addEventListener('pause', () => {
                // If we still want the lock but iOS paused us, try to resume
                // on the next user gesture (autoplay policy) via watchdog/touch.
                lastNoSleepTime = -1;
            });
            document.body.appendChild(video);
            return video;
        } catch (e) { return null; }
    }

    function startNoSleepWatchdog() {
        stopNoSleepWatchdog();
        try {
            lastNoSleepTime = -1;
            noSleepWatchdog = setInterval(() => {
                try {
                    if (!isRunning || !noSleepVideo) return;
                    // iOS 13.4+ bug: playhead can stall at 0 while reporting
                    // "playing". Nudge it forward if time hasn't advanced.
                    const t = noSleepVideo.currentTime;
                    if (noSleepVideo.paused) {
                        noSleepVideo.play().catch(() => {});
                    } else if (lastNoSleepTime >= 0 && t === lastNoSleepTime) {
                        try { noSleepVideo.currentTime = Math.random() * 0.4; } catch (e) {}
                        noSleepVideo.play().catch(() => {});
                    }
                    lastNoSleepTime = noSleepVideo.currentTime;
                } catch (e) {}
            }, 10000);
        } catch (e) {}
    }

    function stopNoSleepWatchdog() {
        try {
            if (noSleepWatchdog) { clearInterval(noSleepWatchdog); noSleepWatchdog = null; }
        } catch (e) { noSleepWatchdog = null; }
        lastNoSleepTime = -1;
    }

    async function playNoSleepVideo() {
        try {
            const video = ensureNoSleepVideo();
            if (!video) return false;
            // Must be called within a user gesture on iOS at least once.
            const p = video.play();
            if (p && typeof p.then === 'function') {
                await p;
            }
            startNoSleepWatchdog();
            return true;
        } catch (e) {
            // Autoplay blocked (no gesture yet) — touch/click handler below retries.
            return false;
        }
    }

    function pauseNoSleepVideo() {
        stopNoSleepWatchdog();
        try {
            if (noSleepVideo) noSleepVideo.pause();
        } catch (e) {}
    }

    // Back-compat wrappers kept (old names used only inside this file).
    function startKeepAwakeFallback() { playNoSleepVideo(); }
    function stopKeepAwakeFallback() { pauseNoSleepVideo(); }

    async function acquireWakeLock() {
        const useVideo = isIOSDevice() || !hasNativeWakeLock();
        // On iOS: start video FIRST (needs user gesture), then try native.
        // Starting video inside the Start-button gesture is what makes iOS allow it.
        if (useVideo) {
            // Don't await — native request should run in parallel.
            playNoSleepVideo();
        }
        if (hasNativeWakeLock()) {
            try {
                if (wakeLock) {
                    // Already held; ensure video backup is running on iOS.
                    return;
                }
                wakeLock = await navigator.wakeLock.request('screen');
                wakeLock.addEventListener('release', () => {
                    wakeLock = null;
                    // OS can release at any time (tab hidden, low power, etc.).
                    // Re-acquire silently if the timer is still running.
                    if (isRunning) {
                        acquireWakeLock();
                    }
                });
            } catch (e) {
                wakeLock = null;
                // Native failed (NotAllowedError, insecure context, Home Screen
                // PWA bug) — video fallback is our safety net.
                if (!useVideo) playNoSleepVideo();
            }
            return;
        }
        // No native API: video already started above (or start now if not iOS path).
        if (!useVideo) playNoSleepVideo();
    }

    function releaseWakeLock() {
        if (wakeLock) {
            try { wakeLock.release(); } catch (e) {}
            wakeLock = null;
        }
        pauseNoSleepVideo();
    }

    function markTick() { try { lastTickAt = Date.now(); } catch (e) {} }

    // The OS releases the wake lock when the tab is hidden — re-acquire
    // when visible again if the timer is still running. Also resume the
    // fallback video, which iOS often pauses on hide.
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && isRunning) {
            markTick();
            acquireWakeLock();
        } else if (document.visibilityState === 'visible' && isPaused) {
            // Keep the anchor fresh so resume doesn't jump.
            markTick();
        }
    });

    // iOS may require a fresh user gesture to (re)start the fallback video
    // after an interruption. Retry on any touch/click while running.
    ['touchend', 'click'].forEach(evt => {
        document.addEventListener(evt, () => {
            try {
                if (isRunning && noSleepVideo && noSleepVideo.paused) {
                    noSleepVideo.play().catch(() => {});
                }
            } catch (e) {}
        }, { passive: true });
    });

    // Timer controls
    function startTimer() {
        if (workout.length === 0) return;

        if (isPaused) {
            isPaused = false;
            isRunning = true;
            markTick();
            timerInterval = setInterval(tick, 1000);
            startBtn.disabled = true;
            pauseBtn.disabled = false;
            resetBtn.disabled = false;
            renderRunningState();
            updateAdjustControls();
            acquireWakeLock();
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
        updateAdjustControls();
        acquireWakeLock();
        markTick();

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
        updateAdjustControls();
        releaseWakeLock();
    }

    function resetTimer() {
        clearInterval(timerInterval);
        isRunning = false;
        isPaused = false;
        currentIndex = 0;

        startBtn.disabled = false;
        pauseBtn.disabled = true;
        resetBtn.disabled = true;

        releaseWakeLock();
        renderWorkoutList();
    }

    function tick() {
        // Wall-clock correction: iOS throttles/suspends setInterval in
        // background or near sleep, so a "1s" tick may arrive seconds late.
        // Subtract real elapsed seconds instead of always 1.
        const now = Date.now();
        let elapsed = Math.round((now - lastTickAt) / 1000);
        if (!(elapsed >= 1)) elapsed = 1;
        lastTickAt = now;

        if (timeLeft <= 3 && timeLeft > 0) {
            playCountdownBeep();
        }

        timeLeft -= elapsed;

        if (timeLeft <= 0) {
            const startIndex = currentIndex;
            // Carry overshoot into the next interval(s) so long background
            // gaps skip correctly instead of losing time.
            while (timeLeft <= 0) {
                currentIndex++;
                if (currentIndex >= workout.length) {
                    // Workout done
                    finishWorkout();
                    return;
                }
                totalDuration = workout[currentIndex].duration;
                timeLeft += totalDuration;
            }
            // Landed on a new interval: sound + flash once (not per skipped item).
            if (currentIndex !== startIndex) {
                const landed = workout[currentIndex];
                if (landed.type === 'break') playBreakSound();
                else playTransitionSound();
                timerTime.classList.add('flash');
                setTimeout(() => timerTime.classList.remove('flash'), 600);
            }
        }

        renderRunningState();
        updateAdjustControls();
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
        clearActivePreset();
        renderWorkoutList();
    });

    addBreakBtn.addEventListener('click', () => {
        const min = parseInt(breakDuration.value) || 0;
        const sec = parseInt(breakDurationSec.value) || 0;
        const duration = min * 60 + sec;
        if (duration <= 0) return;

        workout.push({ type: 'break', name: 'Break', duration });
        clearActivePreset();
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
        clearActivePreset();
        renderWorkoutList();
    });

    clearAllBtn.addEventListener('click', () => {
        if (isRunning) resetTimer();
        workout = [];
        clearActivePreset();
        renderWorkoutList();
    });

    savePresetBtn.addEventListener('click', savePreset);
    importPresetsBtn.addEventListener('click', importPresets);

    startBtn.addEventListener('click', startTimer);
    pauseBtn.addEventListener('click', pauseTimer);
    resetBtn.addEventListener('click', resetTimer);

    adjustBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            adjustTime(parseInt(btn.dataset.adjust, 10) || 0);
        });
    });

    prevBtn.addEventListener('click', () => shiftInterval(-1));
    nextBtn.addEventListener('click', () => shiftInterval(1));

    // Fullscreen: native where supported, CSS fallback for iOS Safari/Chrome.
    // iPhone Safari (and all iOS browsers, which use WKWebView) does NOT
    // support requestFullscreen on generic elements — only on <video> via
    // webkitEnterFullscreen. So the button silently did nothing. Fall back
    // to a fixed-position "pseudo fullscreen" overlay covering the viewport.
    let pseudoFullscreen = false;

    function isNativeFullscreenActive() {
        return !!(document.fullscreenElement || document.webkitFullscreenElement);
    }

    function isFullscreenActive() {
        return isNativeFullscreenActive() || pseudoFullscreen;
    }

    function enterPseudoFullscreen() {
        pseudoFullscreen = true;
        timerPanel.classList.add('is-fullscreen', 'pseudo-fullscreen');
        document.body.classList.add('pseudo-fullscreen-active');
        document.documentElement.classList.add('pseudo-fullscreen-active');
        updateFullscreenBtn();
        try { window.scrollTo(0, 0); } catch (e) {}
    }

    function exitPseudoFullscreen() {
        pseudoFullscreen = false;
        timerPanel.classList.remove('pseudo-fullscreen');
        document.body.classList.remove('pseudo-fullscreen-active');
        document.documentElement.classList.remove('pseudo-fullscreen-active');
        // Keep .is-fullscreen in sync with any native state still active.
        if (!isNativeFullscreenActive()) timerPanel.classList.remove('is-fullscreen');
        updateFullscreenBtn();
    }

    function toggleFullscreen() {
        if (isFullscreenActive()) {
            if (pseudoFullscreen) {
                if (isNativeFullscreenActive()) {
                    try {
                        if (document.exitFullscreen) document.exitFullscreen();
                        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
                    } catch (e) {}
                }
                exitPseudoFullscreen();
            } else {
                try {
                    if (document.exitFullscreen) document.exitFullscreen();
                    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
                } catch (e) {}
            }
            return;
        }
        const el = timerPanel;
        const req = el.requestFullscreen ? el.requestFullscreen.bind(el)
            : el.webkitRequestFullscreen ? el.webkitRequestFullscreen.bind(el)
            : null;
        if (!req) {
            enterPseudoFullscreen();
            return;
        }
        try {
            const result = req();
            if (result && typeof result.then === 'function') {
                result.catch(() => {
                    // Rejected (common on iOS / iframes) -> CSS fallback.
                    enterPseudoFullscreen();
                });
                // Safety net: some iOS WebKit versions neither resolve nor
                // reject and never fire fullscreenchange. Fall back if needed.
                setTimeout(() => {
                    if (!isNativeFullscreenActive() && !pseudoFullscreen) enterPseudoFullscreen();
                }, 500);
            } else {
                // Older WebKit with no promise: verify via timeout fallback.
                setTimeout(() => {
                    if (!isNativeFullscreenActive() && !pseudoFullscreen) enterPseudoFullscreen();
                }, 400);
            }
        } catch (e) {
            enterPseudoFullscreen();
        }
    }

    fullscreenBtn.addEventListener('click', toggleFullscreen);

    document.addEventListener('fullscreenchange', updateFullscreenBtn);
    document.addEventListener('webkitfullscreenchange', updateFullscreenBtn);

    // Exiting native fullscreen via swipe/gesture must also clear pseudo state
    // if both somehow got set.
    function updateFullscreenBtn() {
        const nativeFS = isNativeFullscreenActive();
        const isFS = nativeFS || pseudoFullscreen;
        fullscreenBtn.textContent = isFS ? '\u2715' : '\u26F6';
        fullscreenBtn.title = isFS ? 'Exit Fullscreen' : 'Fullscreen';
        timerPanel.classList.toggle('is-fullscreen', isFS);
        if (pseudoFullscreen) timerPanel.classList.add('pseudo-fullscreen');
    }

    // Escape exits pseudo-fullscreen too (native exit is handled by browser).
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && pseudoFullscreen && !isNativeFullscreenActive()) {
            exitPseudoFullscreen();
        }
    });

    // Init
    loadPresets();
    loadDurations();
    // Restore last session: active preset first (so highlight is correct),
    // then the builder workout. Falls back to the last loaded preset for
    // users updating from a version without workout persistence.
    loadActivePresetName();
    if (!loadWorkoutFromStorage() && activePresetName && presets[activePresetName]) {
        workout = JSON.parse(JSON.stringify(presets[activePresetName]));
        saveWorkoutToStorage();
    }
    // Stored preset may have been deleted/renamed externally — drop the marker.
    if (activePresetName && !presets[activePresetName]) {
        activePresetName = null;
        try { localStorage.removeItem(LAST_PRESET_KEY); } catch (e) {}
    }
    renderWorkoutList();
    renderPresets();
})();
