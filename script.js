import { FogFX } from './fog.js';
import { applyPosterizeToImage } from './posterize.js';
document.addEventListener('DOMContentLoaded', () => {
    console.log("Script loaded and running.");
    const AUDIO_DURATION = 95, FADE = 15, FADE_OUT_START = 80;
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    let audioUnlocked = false;
    let backgroundAudioElement;
    let fogInstance;
    let cutsceneAudio;

    const knockSoundUrls = ['knock.mp3', 'knock_2.mp3', 'knock_3.mp3', 'knock_4.mp3'];
    let knockBuffers = [];
    let uiHoverBuffer;
    let tvStaticLoopBuffer;
    let knockTimeoutId = null, knockingActive = false, primaryKnockBuffer = null;

    async function loadSound(url) {
        try {
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            return await audioCtx.decodeAudioData(arrayBuffer);
        } catch (e) {
            console.error(`Failed to load or decode sound: ${url}`, e);
            return null;
        }
    }

    async function loadAllSounds() {
        knockBuffers = await Promise.all(knockSoundUrls.map(url => loadSound(url)));
        knockBuffers = knockBuffers.filter(b => b); // remove nulls on failure
        uiHoverBuffer = await loadSound('ui_hover.mp3');
        tvStaticLoopBuffer = await loadSound('tv_static_loop.mp3');
        primaryKnockBuffer = await loadSound('knock.mp3');
    }

    function setupAudio() {
        if (backgroundAudioElement) return; // Already setup
        const audio = new Audio('Fleshy Decay - Sonauto.ai.ogg');
        backgroundAudioElement = audio;
        audio.loop = false; audio.preload = 'auto';
        
        const src = audioCtx.createMediaElementSource(audio);
        const gain = audioCtx.createGain(); gain.gain.value = 0;
        src.connect(gain).connect(audioCtx.destination);

        const apply = () => {
            const t = audio.currentTime; let g = 1;
            if (t < FADE) g = t / FADE;
            else if (t >= FADE_OUT_START) g = Math.max(0, (AUDIO_DURATION - t) / FADE);
            gain.gain.setTargetAtTime(g, audioCtx.currentTime, 0.05);
        };
        audio.addEventListener('timeupdate', apply);
        audio.addEventListener('seeked', apply);

        audio.addEventListener('ended', () => { audio.currentTime = 0; audio.play(); });
        audio.play().catch(e => console.error("Background audio play failed:", e));
    }

    async function unlockAudio() {
        if (audioUnlocked) return;
        if (audioCtx.state === 'suspended') {
            await audioCtx.resume();
        }
        audioUnlocked = true;
    }

    function adjustLayout() {
        const sidePanels = document.querySelectorAll('.side-panel');
        if (sidePanels.length === 0) return;

        const app = document.getElementById('app');
        if (!app) return;
        
        const contentHeight = app.clientHeight - (4 * parseFloat(getComputedStyle(app).paddingTop)); // Approximate viewport height within padding
        const panelWidth = sidePanels[0].clientWidth;

        const gap = parseFloat(getComputedStyle(sidePanels[0]).gap) || 0;
        const boxHeight = (contentHeight - (4 * gap)) / 5;
        const requiredWidth = boxHeight * (16 / 9);

        sidePanels.forEach(panel => {
            if (requiredWidth > panelWidth) {
                panel.classList.add('vertical-aspect');
            } else {
                panel.classList.remove('vertical-aspect');
            }
        });
    }

    function updateBackgroundDrip() {
        const bg = document.querySelector('.background-drip');
        const fig = document.querySelector('.figure-container');
        if (!bg || !fig) return;
        const r = fig.getBoundingClientRect();
        const startY = Math.round(r.top + r.height * 0.85);
        bg.style.clipPath = `inset(${startY}px 0 0 0)`;
    }

    function initSideCarousels() {
        document.querySelectorAll('.side-panel').forEach(panel => {
            if (panel.querySelector('.panel-track')) return;
            const boxes = Array.from(panel.querySelectorAll('.feature-box'));
            const track = document.createElement('div');
            track.className = 'panel-track';
            boxes.forEach(b => track.appendChild(b));
            panel.appendChild(track);
            panel.dataset.direction = panel.classList.contains('left-panel') ? 'down' : 'up';
        });
    }

    function measureStep(panel) {
        const track = panel.querySelector('.panel-track');
        const a = track.children[0], b = track.children[1];
        if (!a || !b) return 0;
        const r1 = a.getBoundingClientRect(), r2 = b.getBoundingClientRect();
        return Math.max(0, r2.top - r1.top); // height + gap
    }

    function cyclePanel(panel) {
        const track = panel.querySelector('.panel-track');
        if (!track || track.children.length < 2) return;
        const dir = panel.dataset.direction;
        const step = measureStep(panel);
        if (!step) return;

        if (dir === 'up') {
            track.style.transition = 'transform 2.2s ease-in-out';
            track.style.transform = `translateY(${-step}px)`;
            const onEnd = () => {
                track.removeEventListener('transitionend', onEnd);
                track.appendChild(track.firstElementChild);
                track.style.transition = 'none';
                track.style.transform = 'translateY(0)';
                // force reflow
                void track.offsetHeight;
                track.style.transition = 'transform 2.2s ease-in-out';
            };
            track.addEventListener('transitionend', onEnd, { once: true });
        } else {
            track.style.transition = 'none';
            track.insertBefore(track.lastElementChild, track.firstElementChild);
            track.style.transform = `translateY(${-step}px)`;
            // next frame animate down to 0
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    track.style.transition = 'transform 2.2s ease-in-out';
                    track.style.transform = 'translateY(0)';
                });
            });
        }
    }

    function startCarousels() {
        const panels = Array.from(document.querySelectorAll('.side-panel'));
        if (!panels.length) return;
        // initial layout pass to ensure sizes set
        setTimeout(() => {
            panels.forEach(p => cyclePanel(p));
        }, 600);
        setInterval(() => {
            panels.forEach(p => cyclePanel(p));
        }, 3000);
    }

    function typeText(el, text, speed = 40) {
        el.textContent = '';
        let i = 0;
        return new Promise(res => {
            const tick = () => { el.textContent += text[i++] || ''; i <= text.length ? setTimeout(tick, speed) : res(); };
            tick();
        });
    }

    function typeTextAppend(el, text, speed = 40) {
        let i = 0;
        return new Promise(res => {
            const tick = () => { el.textContent += text[i++] || ''; i <= text.length ? setTimeout(tick, speed) : res(); };
            tick();
        });
    }

    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    function wrapComma(spanEl){
        const t = spanEl.textContent;
        const idx = t.lastIndexOf(',');
        if (idx === -1) return null;
        spanEl.textContent = '';
        spanEl.append(t.slice(0, idx));
        const comma = document.createElement('span');
        comma.className = 'bounce-comma';
        comma.textContent = ',';
        spanEl.appendChild(comma);
        spanEl.append(t.slice(idx+1));
        return comma;
    }

    function pulseNotRandomly(notEl){
        setInterval(() => {
            notEl.classList.add('pulse-red');
            setTimeout(()=>notEl.classList.remove('pulse-red'), 1300);
        }, 12000 + Math.random()*6000);
    }

    function waitForNot(el){
        return new Promise(res=>{
            const id = setInterval(()=>{
                if (el.textContent.includes('NOT')){ clearInterval(id); res(); }
            }, 50);
        });
    }

    function initOverlayFlow() {
        const overlay = document.getElementById('ui-overlay');
        const prompt = document.getElementById('overlay-prompt');
        const yesBtn = document.getElementById('overlay-yes');
        const overlayInner = overlay.querySelector('.overlay-inner');
        const title = document.getElementById('main-title');
        const titleText = title.getAttribute('aria-label') || "NO, I'M NOT A HUMAN";

        typeText(prompt, "Are you a human?").then(() => { yesBtn.disabled = false; });
        yesBtn.addEventListener('click', async () => {
            overlay.style.pointerEvents = 'none';
            if(overlayInner) overlayInner.style.pointerEvents = 'auto';
            yesBtn.style.display = 'none';
            prompt.classList.add('fade');
            if(overlayInner) overlayInner.style.pointerEvents = 'none';
            await unlockAudio();
            setupAudio();
            scheduleNextKnock();
            // fade out the black loading overlay now that user confirmed
            const loadingOverlay = document.getElementById('loading-overlay');
            if (loadingOverlay) loadingOverlay.classList.add('hidden');
            title.textContent = '';
            const prefix = document.createElement('span');
            const rest = document.createElement('span');
            title.append(prefix, rest);
            await typeText(prefix, "NO,", 180);
            const commaEl = wrapComma(prefix);
            await sleep(900);
            if (commaEl){ commaEl.classList.add('slow'); }
            const typing = typeTextAppend(rest, " I'M NOT A HUMAN", 90);
            await waitForNot(rest);
            // wrap NOT and handle initial red fade to white
            rest.innerHTML = rest.textContent.replace('NOT','<span class="not-word">NOT</span>');
            const notEl = rest.querySelector('.not-word');
            requestAnimationFrame(()=>{ notEl.style.color = '#ddd'; }); // fade to white via CSS transition
            pulseNotRandomly(notEl);
            await typing;
        }, { once: true });
    }

    function playSound(buffer, volume = 1.0, onEndedCallback = null, loop = false, fadeInDuration = 0) {
        if (!audioUnlocked || !buffer) return null;
        
        try {
            const source = audioCtx.createBufferSource();
            source.buffer = buffer;
            source.loop = loop;

            const gainNode = audioCtx.createGain();
            if (fadeInDuration > 0) {
                gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
                gainNode.gain.linearRampToValueAtTime(volume, audioCtx.currentTime + fadeInDuration);
            } else {
                gainNode.gain.value = volume;
            }

            source.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            source.start(0);

            if (onEndedCallback && !loop) {
                source.addEventListener('ended', onEndedCallback, { once: true });
            }

            return { source, gainNode };
        } catch (e) {
            console.error("Could not play sound:", e);
            return null;
        }
    }

    function playKnock() {
        if (knockBuffers.length === 0) return;
        const randomIndex = Math.floor(Math.random() * knockBuffers.length);
        playSound(knockBuffers[randomIndex]);
    }

    function scheduleNextKnock() {
        knockingActive = true;
        const randomInterval = Math.random() * (10000 - 3000) + 3000;
        knockTimeoutId = setTimeout(() => { if (!knockingActive) return; playKnock(); scheduleNextKnock(); }, randomInterval);
    }

    function stopKnocks() {
        knockingActive = false;
        if (knockTimeoutId) { clearTimeout(knockTimeoutId); knockTimeoutId = null; }
    }

    function initButtonHovers() {
        const buttons = document.querySelectorAll('.menu button, .overlay-btn, .credits-btn');
        let staticLoopSound = null;
        let initialSoundSource = null;
        let touchInProgress = false;

        const stopAllSounds = () => {
            if (initialSoundSource) {
                try { initialSoundSource.stop(); } catch (e) { /* ignore */ }
                initialSoundSource = null;
            }
            if (staticLoopSound) {
                const { source, gainNode } = staticLoopSound;
                // Fade out
                const fadeOutDuration = 0.2;
                gainNode.gain.cancelScheduledValues(audioCtx.currentTime);
                gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + fadeOutDuration);
                setTimeout(() => {
                    try { source.stop(); } catch (e) { /* ignore */ }
                }, fadeOutDuration * 1000);
                staticLoopSound = null;
            }
        };

        const handleHoverStart = (button) => {
            if (button.disabled) return;
            stopAllSounds();
            button.classList.add('static-bg-active');
            const hoverSound = playSound(uiHoverBuffer, 0.2);
            if(hoverSound) initialSoundSource = hoverSound.source;
            staticLoopSound = playSound(tvStaticLoopBuffer, 0.1, null, true, 0.5); // 0.5s fade-in
        };

        const handleHoverEnd = (button) => {
            stopAllSounds();
            button.classList.remove('static-bg-active');
        };

        buttons.forEach(button => {
            // Mouse events
            button.addEventListener('mouseenter', (e) => {
                if (touchInProgress) return; // Don't fire if a touch is happening
                handleHoverStart(e.currentTarget);
            });
            button.addEventListener('mouseleave', (e) => {
                if (touchInProgress) return;
                handleHoverEnd(e.currentTarget);
            });

            // Touch events
            button.addEventListener('touchstart', (e) => {
                touchInProgress = true;
                handleHoverStart(e.currentTarget);
            }, { passive: true });

            button.addEventListener('touchend', (e) => {
                handleHoverEnd(e.currentTarget);
                // After a short delay, reset the flag to allow mouse events again.
                // This prevents mouseenter from firing immediately after touchend on some devices.
                setTimeout(() => {
                    touchInProgress = false;
                }, 100);
            });

             button.addEventListener('touchcancel', (e) => {
                handleHoverEnd(e.currentTarget);
                setTimeout(() => {
                    touchInProgress = false;
                }, 100);
            });
        });
    }

    async function startCutscene(){
        const cs=document.getElementById('cutscene'), img=document.getElementById('cutscene-image');
        const canvas=document.getElementById('cutscene-canvas');
        const loading=cs.querySelector('.cutscene-loading'); cs.style.display='flex'; loading.style.display='grid';
        img.onload=()=>{ loading.style.display='none'; applyPosterizeToImage(canvas, img, 5.0, 0.12); canvas.classList.add('reveal'); img.style.display='none'; };
        img.src='cutscene_landscape.png';
        if(backgroundAudioElement) { try{ backgroundAudioElement.pause(); }catch(e){} }
        cutsceneAudio=new Audio('Distant Transmission - Sonauto.ai.ogg'); const src=audioCtx.createMediaElementSource(cutsceneAudio);
        const g=audioCtx.createGain(); g.gain.value=0; src.connect(g).connect(audioCtx.destination);
        await audioCtx.resume(); await cutsceneAudio.play().catch(()=>{});
        g.gain.linearRampToValueAtTime(1, audioCtx.currentTime+7);
        setTimeout(()=>{ g.gain.cancelScheduledValues(audioCtx.currentTime); g.gain.linearRampToValueAtTime(0, audioCtx.currentTime+7); }, (115-7)*1000);
    }

    async function main() {
        const loadingOverlay = document.getElementById('loading-overlay');

        // Start fog immediately so it's ready when the loading overlay fades
        fogInstance = new FogFX('#fog-canvas');
        fogInstance.start();

        // Start the overlay flow immediately, above the loading overlay
        initOverlayFlow();

        // Initial layout adjustments
        adjustLayout();
        updateBackgroundDrip();
        initSideCarousels();
        startCarousels();
        initButtonHovers();

        // New Game -> start cutscene
        const newGameBtn = Array.from(document.querySelectorAll('.menu button')).find(b=>b.textContent.trim()==='New Game');
        if(newGameBtn){
            newGameBtn.addEventListener('click', async ()=>{
                newGameBtn.disabled=true; stopKnocks(); if(primaryKnockBuffer) playSound(primaryKnockBuffer, 1.0);
                await startCutscene();
            });
        }

        // Adjust on window resize
        window.addEventListener('resize', () => {
            adjustLayout();
            updateBackgroundDrip();
        });

        // Wait for all sounds to load (do NOT hide loading overlay here)
        await loadAllSounds();

        // hide spinner but keep black overlay until "Yes..." click
        const spinner = loadingOverlay && loadingOverlay.querySelector('.loader');
        if (spinner) spinner.style.display = 'none';
    }

    main();
});