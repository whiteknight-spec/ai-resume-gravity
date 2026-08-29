/* ===========================
   ResumeAI — Application Logic v2
   Bulk PDF Analysis + ATS + Ranking
   =========================== */

// Set PDF.js worker
if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

document.addEventListener('DOMContentLoaded', () => {

    // ===========================
    // State
    // ===========================
    let bulkFiles = []; // {file, name, size, text, status}
    let bulkResults = []; // analysis results
    let sortField = 'overall';
    let sortAsc = false;
    let activeFilter = 'all';

    // ===========================
    // Navbar
    // ===========================
    const navbar = document.getElementById('navbar');
    window.addEventListener('scroll', () => navbar.classList.toggle('scrolled', window.scrollY > 50));

    // ===========================
    // Hero Counters
    // ===========================
    const statNumbers = document.querySelectorAll('.stat-number[data-count]');
    const animateCounters = () => {
        statNumbers.forEach(el => {
            const target = parseInt(el.dataset.count);
            const start = performance.now();
            const update = (now) => {
                const p = Math.min((now - start) / 2000, 1);
                el.textContent = Math.floor(target * (1 - Math.pow(1 - p, 3))).toLocaleString();
                if (p < 1) requestAnimationFrame(update);
            };
            requestAnimationFrame(update);
        });
    };
    const heroObs = new IntersectionObserver(entries => {
        if (entries[0].isIntersecting) { animateCounters(); heroObs.disconnect(); }
    }, { threshold: 0.3 });
    heroObs.observe(document.getElementById('hero'));

    // ===========================
    // Scroll Fade
    // ===========================
    const fadeEls = document.querySelectorAll('.feature-card, .step-card, .findings-card, .tip-card');
    fadeEls.forEach(el => el.classList.add('fade-in'));
    const fadeObs = new IntersectionObserver(entries => {
        entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
    }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });
    fadeEls.forEach(el => fadeObs.observe(el));

    // ===========================
    // Smooth scroll
    // ===========================
    document.querySelectorAll('a[href^="#"]').forEach(link => {
        link.addEventListener('click', e => {
            const t = document.querySelector(link.getAttribute('href'));
            if (t) { e.preventDefault(); t.scrollIntoView({ behavior: 'smooth' }); }
        });
    });

    // ===========================
    // PDF Text Extraction
    // ===========================
    async function extractTextFromPDF(file) {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let text = '';
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            text += content.items.map(item => item.str).join(' ') + '\n';
        }
        return text;
    }

    async function extractTextFromFile(file) {
        if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
            return await extractTextFromPDF(file);
        }
        // For txt files, read directly
        return await file.text();
    }

    // ===========================
    // BULK UPLOAD
    // ===========================
    const bulkDropZone = document.getElementById('bulk-drop-zone');
    const bulkFileInput = document.getElementById('bulk-file-input');
    const bulkBrowse = document.getElementById('bulk-browse');
    const fileQueue = document.getElementById('file-queue');
    const queueList = document.getElementById('queue-list');
    const queueCount = document.getElementById('queue-count');
    const clearQueueBtn = document.getElementById('clear-queue-btn');
    const addMoreBtn = document.getElementById('add-more-btn');
    const bulkAnalyzeBtn = document.getElementById('bulk-analyze-btn');

    bulkDropZone.addEventListener('click', () => bulkFileInput.click());
    bulkBrowse.addEventListener('click', (e) => { e.stopPropagation(); bulkFileInput.click(); });

    bulkDropZone.addEventListener('dragover', e => { e.preventDefault(); bulkDropZone.classList.add('drag-over'); });
    bulkDropZone.addEventListener('dragleave', () => bulkDropZone.classList.remove('drag-over'));
    bulkDropZone.addEventListener('drop', e => {
        e.preventDefault();
        bulkDropZone.classList.remove('drag-over');
        addFilesToQueue([...e.dataTransfer.files]);
    });

    bulkFileInput.addEventListener('change', () => {
        addFilesToQueue([...bulkFileInput.files]);
        bulkFileInput.value = '';
    });

    addMoreBtn.addEventListener('click', () => bulkFileInput.click());
    clearQueueBtn.addEventListener('click', () => {
        bulkFiles = [];
        renderQueue();
    });

    function addFilesToQueue(files) {
        const validFiles = files.filter(f =>
            f.type === 'application/pdf' || f.type === 'text/plain' ||
            f.name.match(/\.(pdf|txt|doc|docx)$/i)
        );

        if (validFiles.length === 0) {
            alert('Please upload PDF or TXT files.');
            return;
        }

        validFiles.forEach(f => {
            // Avoid duplicates
            if (!bulkFiles.find(bf => bf.name === f.name && bf.size === f.size)) {
                bulkFiles.push({ file: f, name: f.name, size: f.size, text: '', status: 'ready' });
            }
        });

        renderQueue();
    }

    function renderQueue() {
        if (bulkFiles.length === 0) {
            fileQueue.style.display = 'none';
            bulkDropZone.style.display = 'block';
            return;
        }

        bulkDropZone.style.display = 'none';
        fileQueue.style.display = 'block';
        queueCount.textContent = bulkFiles.length;

        queueList.innerHTML = '';
        bulkFiles.forEach((f, i) => {
            const item = document.createElement('div');
            item.className = 'queue-item';
            item.innerHTML = `
                <span class="queue-item-icon">📄</span>
                <span class="queue-item-name">${f.name}</span>
                <span class="queue-item-size">${formatSize(f.size)}</span>
                <span class="queue-item-status ${f.status}">${f.status === 'ready' ? '● Ready' : f.status === 'processing' ? '⟳ Processing' : '✓ Done'}</span>
                <button class="queue-item-remove" data-index="${i}" title="Remove">✕</button>
            `;
            queueList.appendChild(item);
        });

        // Remove buttons
        queueList.querySelectorAll('.queue-item-remove').forEach(btn => {
            btn.addEventListener('click', () => {
                bulkFiles.splice(parseInt(btn.dataset.index), 1);
                renderQueue();
            });
        });
    }

    function formatSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1048576).toFixed(1) + ' MB';
    }

    // ===========================
    // BULK ANALYZE
    // ===========================
    const bulkUploadSection = document.getElementById('bulk-upload');
    const bulkLoading = document.getElementById('bulk-loading');
    const rankingSection = document.getElementById('ranking-section');
    const bulkProgressBar = document.getElementById('bulk-progress-bar');
    const bulkLoaderStatus = document.getElementById('bulk-loader-status');
    const bulkLoaderCount = document.getElementById('bulk-loader-count');
    const loaderFileStatus = document.getElementById('loader-file-status');

    bulkAnalyzeBtn.addEventListener('click', async () => {
        if (bulkFiles.length === 0) { alert('Please add PDF files first.'); return; }

        const jdText = document.getElementById('jd-input').value.trim();
        const minScore = parseInt(document.getElementById('jd-min-score').value) || 0;

        bulkUploadSection.style.display = 'none';
        bulkLoading.style.display = 'block';
        bulkLoading.scrollIntoView({ behavior: 'smooth', block: 'center' });
        bulkLoaderCount.textContent = bulkFiles.length;
        bulkProgressBar.style.width = '0%';
        bulkResults = [];

        // Phase 1: Extract text from all PDFs
        bulkLoaderStatus.textContent = 'Extracting text from PDFs...';
        for (let i = 0; i < bulkFiles.length; i++) {
            const f = bulkFiles[i];
            loaderFileStatus.textContent = `Processing: ${f.name} (${i + 1}/${bulkFiles.length})`;
            const extractProgress = ((i + 1) / bulkFiles.length) * 50;
            bulkProgressBar.style.width = extractProgress + '%';

            try {
                f.text = await extractTextFromFile(f.file);
                f.status = 'done';
            } catch (err) {
                console.error(`Error extracting ${f.name}:`, err);
                f.text = `[Could not extract text from ${f.name}]`;
                f.status = 'done';
            }

            // Small delay for UI update
            await new Promise(r => setTimeout(r, 50));
        }

        // Phase 2: Analyze each resume
        bulkLoaderStatus.textContent = 'Running AI analysis on each resume...';
        for (let i = 0; i < bulkFiles.length; i++) {
            const f = bulkFiles[i];
            loaderFileStatus.textContent = `Analyzing: ${f.name} (${i + 1}/${bulkFiles.length})`;
            const analyzeProgress = 50 + ((i + 1) / bulkFiles.length) * 45;
            bulkProgressBar.style.width = analyzeProgress + '%';

            const result = analyzeResume(f.text, jdText);
            result.fileName = f.name;
            result.fileSize = f.size;
            bulkResults.push(result);

            await new Promise(r => setTimeout(r, 80));
        }

        // Phase 3: Rank
        bulkLoaderStatus.textContent = 'Ranking candidates...';
        bulkProgressBar.style.width = '98%';
        await new Promise(r => setTimeout(r, 400));

        bulkProgressBar.style.width = '100%';
        loaderFileStatus.textContent = '';

        await new Promise(r => setTimeout(r, 500));

        // Show ranking
        bulkLoading.style.display = 'none';
        showRankingDashboard(minScore);
    });

    // ===========================================================
    // KEYWORD TAXONOMY, ALIASES & NORMALIZATION
    // (drives Fixes 1, 5, 6, 8 — categorized, deduplicated,
    //  alias-aware keyword matching used everywhere)
    // ===========================================================
    const TAXONOMY = {
        languages: ['javascript', 'typescript', 'python', 'java', 'c++', 'c#', 'ruby', 'php', 'go', 'rust', 'swift', 'kotlin', 'scala', 'r', 'sql', 'html', 'css', 'shell', 'bash'],
        frameworks: ['react', 'angular', 'vue', 'node', 'express', 'django', 'flask', 'spring', 'laravel', 'rails', 'next.js', 'nuxt', 'svelte', 'dotnet'],
        tools: ['git', 'docker', 'kubernetes', 'jenkins', 'terraform', 'ansible', 'webpack', 'jira', 'figma', 'postman', 'jest', 'cypress', 'excel'],
        platforms: ['aws', 'azure', 'gcp', 'firebase', 'heroku', 'vercel', 'netlify'],
        databases: ['mongodb', 'postgresql', 'mysql', 'redis', 'sqlite', 'oracle', 'dynamodb', 'cassandra', 'elasticsearch'],
        practices: ['agile', 'scrum', 'devops', 'ci/cd', 'microservices', 'rest', 'graphql', 'tdd', 'object-oriented programming', 'machine learning', 'natural language processing'],
        roleTerms: ['stakeholder management', 'product roadmap', 'go-to-market', 'a/b testing', 'user research', 'sprint planning', 'api design', 'system design', 'distributed systems', 'data pipeline', 'incident response', 'code review'],
        domain: ['fintech', 'healthcare', 'saas', 'e-commerce', 'logistics', 'supply chain', 'cybersecurity', 'compliance', 'hipaa', 'gdpr', 'pci-dss'],
        softSkills: ['leadership', 'communication', 'teamwork', 'collaboration', 'problem-solving', 'mentoring', 'stakeholder management', 'project management', 'time management', 'adaptability', 'critical thinking'],
    };

    const CATEGORY_LABELS = {
        languages: 'Programming Language',
        frameworks: 'Framework / Library',
        tools: 'Tool / Technology',
        platforms: 'Platform / Cloud',
        databases: 'Database',
        practices: 'Practice / Methodology',
        roleTerms: 'Role-Specific Term',
        domain: 'Domain Knowledge',
        softSkills: 'Soft Skill',
    };

    // Variant/alias -> canonical taxonomy term. Handles case differences,
    // abbreviations, and equivalent phrasings (Fix 8).
    const ALIASES = {
        'js': 'javascript', 'ecmascript': 'javascript',
        'ts': 'typescript',
        'c plus plus': 'c++', 'cpp': 'c++',
        'c sharp': 'c#', 'csharp': 'c#',
        'python programming': 'python', 'python3': 'python', 'python 3': 'python',
        'structured query language': 'sql',
        'microsoft excel': 'excel', 'ms excel': 'excel',
        'node.js': 'node', 'nodejs': 'node',
        'react.js': 'react', 'reactjs': 'react',
        'vue.js': 'vue', 'vuejs': 'vue',
        'k8s': 'kubernetes',
        'amazon web services': 'aws',
        'google cloud platform': 'gcp', 'google cloud': 'gcp',
        'microsoft azure': 'azure',
        'postgres': 'postgresql',
        'cicd': 'ci/cd', 'continuous integration': 'ci/cd', 'continuous deployment': 'ci/cd',
        'ml': 'machine learning',
        'nlp': 'natural language processing',
        'oop': 'object-oriented programming', 'object oriented programming': 'object-oriented programming',
        'problem solving': 'problem-solving',
        '.net': 'dotnet',
    };

    // Human-friendly display names for canonical terms.
    const DISPLAY_NAMES = {
        javascript: 'JavaScript', typescript: 'TypeScript', python: 'Python', java: 'Java', 'c++': 'C++', 'c#': 'C#',
        ruby: 'Ruby', php: 'PHP', go: 'Go', rust: 'Rust', swift: 'Swift', kotlin: 'Kotlin', scala: 'Scala', r: 'R',
        sql: 'SQL', html: 'HTML', css: 'CSS', shell: 'Shell', bash: 'Bash',
        react: 'React', angular: 'Angular', vue: 'Vue.js', node: 'Node.js', express: 'Express', django: 'Django',
        flask: 'Flask', spring: 'Spring', laravel: 'Laravel', rails: 'Ruby on Rails', 'next.js': 'Next.js',
        nuxt: 'Nuxt.js', svelte: 'Svelte', dotnet: '.NET',
        git: 'Git', docker: 'Docker', kubernetes: 'Kubernetes', jenkins: 'Jenkins', terraform: 'Terraform',
        ansible: 'Ansible', webpack: 'Webpack', jira: 'Jira', figma: 'Figma', postman: 'Postman', jest: 'Jest',
        cypress: 'Cypress', excel: 'Excel',
        aws: 'AWS', azure: 'Azure', gcp: 'GCP', firebase: 'Firebase', heroku: 'Heroku', vercel: 'Vercel', netlify: 'Netlify',
        mongodb: 'MongoDB', postgresql: 'PostgreSQL', mysql: 'MySQL', redis: 'Redis', sqlite: 'SQLite', oracle: 'Oracle',
        dynamodb: 'DynamoDB', cassandra: 'Cassandra', elasticsearch: 'Elasticsearch',
        agile: 'Agile', scrum: 'Scrum', devops: 'DevOps', 'ci/cd': 'CI/CD', microservices: 'Microservices',
        rest: 'REST', graphql: 'GraphQL', tdd: 'TDD', 'object-oriented programming': 'OOP',
        'machine learning': 'Machine Learning', 'natural language processing': 'NLP',
        hipaa: 'HIPAA', gdpr: 'GDPR', 'pci-dss': 'PCI-DSS',
    };

    function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

    function variantsFor(canonical) {
        return [canonical, ...Object.entries(ALIASES).filter(([, c]) => c === canonical).map(([a]) => a)];
    }

    // Word-boundary aware match — required everywhere, not just for short
    // terms, so e.g. "java" doesn't false-positive-match inside
    // "javascript", or "sql" inside "postgresql"/"mysql".
    function buildBoundaryRegex(term) {
        return new RegExp(`(?<![a-z0-9])${escapeRegex(term)}(?![a-z0-9])`, 'i');
    }

    function termFoundIn(lowerText, canonical) {
        return variantsFor(canonical).some(v => buildBoundaryRegex(v).test(lowerText));
    }

    function displayTerm(canonical) {
        return DISPLAY_NAMES[canonical] || canonical.replace(/\b\w/g, c => c.toUpperCase());
    }

    function splitSentences(text) {
        return text.split(/(?<=[.!?;\n])/).map(s => s.trim()).filter(Boolean);
    }
    function isPreferredSentence(s) { return /prefer(red|ably)?|nice[\s-]to[\s-]have|a\s+plus|bonus|desirable|good[\s-]to[\s-]have|plus\s+if/i.test(s); }
    function isRequiredSentence(s) { return /require|must[\s-]have|essential|mandatory|need\s+to\s+have|minimum\s+qualification/i.test(s); }

    const SECTION_PATTERNS = {
        experience: /\b(professional experience|work experience|work history|experience)\b/i,
        education: /\beducation\b/i,
        skills: /\b(technical skills|core competencies|skills)\b/i,
        summary: /\b(professional summary|summary|profile)\b/i,
        objective: /\bobjective\b/i,
        projects: /\bprojects?\b/i,
        certifications: /\bcertifications?\b/i,
        awards: /\bawards?\b/i,
    };

    // Extract only meaningful, dictionary-recognized JD requirements —
    // never arbitrary English words (Fix 1) — with required/preferred
    // classification (Fix 6) and automatic alias de-duplication (Fix 8).
    function extractJDKeywords(jdText) {
        if (!jdText) return [];
        const jdLower = jdText.toLowerCase();
        const sentences = splitSentences(jdText);
        const results = [];
        const seen = new Set();

        Object.entries(TAXONOMY).forEach(([cat, list]) => {
            list.forEach(canonical => {
                if (seen.has(canonical)) return;
                if (!termFoundIn(jdLower, canonical)) return;
                seen.add(canonical);

                const variants = variantsFor(canonical);
                const relevantSentences = sentences.filter(s => {
                    const sl = s.toLowerCase();
                    return variants.some(v => sl.includes(v));
                });

                let required = true;
                if (relevantSentences.length) {
                    const anyPreferred = relevantSentences.some(isPreferredSentence);
                    const anyRequired = relevantSentences.some(isRequiredSentence);
                    if (anyPreferred && !anyRequired) required = false;
                }

                results.push({ canonical, category: CATEGORY_LABELS[cat], required });
            });
        });

        return results;
    }

    // Locate a short evidence snippet + resume section for a matched term,
    // so strengths can cite exactly where in the resume it was found (Fix 2).
    function findEvidence(content, canonical) {
        const lower = content.toLowerCase();
        const variants = variantsFor(canonical);
        let idx = -1, matchLen = 0;
        for (const v of variants) {
            const m = buildBoundaryRegex(v).exec(lower);
            if (m) { idx = m.index; matchLen = v.length; break; }
        }
        if (idx === -1) return { snippet: '', section: '' };

        const start = Math.max(0, idx - 40);
        const end = Math.min(content.length, idx + matchLen + 40);
        let snippet = content.slice(start, end).replace(/\s+/g, ' ').trim();
        if (start > 0) snippet = '…' + snippet;
        if (end < content.length) snippet = snippet + '…';

        const before = content.slice(0, idx);
        const lines = before.split('\n');
        let section = '';
        for (let i = lines.length - 1, checked = 0; i >= 0 && checked < 15; i--) {
            const l = lines[i].trim();
            if (!l) continue;
            checked++;
            const hit = Object.entries(SECTION_PATTERNS).find(([, re]) => re.test(l) && l.length < 40);
            if (hit) { section = hit[0].charAt(0).toUpperCase() + hit[0].slice(1); break; }
        }
        return { snippet, section };
    }

    function dedupeByTerm(arr) {
        const seen = new Set();
        return arr.filter(x => { if (seen.has(x.term)) return false; seen.add(x.term); return true; });
    }

    function clamp(val, min, max) { return Math.min(max, Math.max(min, val)); }

    // ===========================================================
    // ANALYSIS ENGINE
    // ===========================================================
    function analyzeResume(content, jobDescription = '') {
        const lower = content.toLowerCase();
        const wordCount = content.split(/\s+/).filter(Boolean).length;
        const lineCount = content.split('\n').length;

        const scores = {};
        const strengths = [];
        const improvements = [];
        const atsChecks = [];

        const jdKeywords = extractJDKeywords(jobDescription);

        // Which resume sections are actually present (checked individually
        // so we never contradictorily tell someone to add a section they
        // already have — Fix 3).
        const presentSections = Object.entries(SECTION_PATTERNS)
            .filter(([, re]) => re.test(content))
            .map(([k]) => k);

        // -- Match JD requirements against the resume --
        let requiredTotal = 0, requiredMatched = 0, preferredTotal = 0, preferredMatched = 0;
        let foundKeywords = [];
        let missingKeywords = [];

        jdKeywords.forEach(k => {
            if (k.required) requiredTotal++; else preferredTotal++;
            if (termFoundIn(lower, k.canonical)) {
                if (k.required) requiredMatched++; else preferredMatched++;
                const ev = findEvidence(content, k.canonical);
                foundKeywords.push({ term: displayTerm(k.canonical), category: k.category, required: k.required, evidence: ev.snippet, section: ev.section });
            } else {
                missingKeywords.push({ term: displayTerm(k.canonical), category: k.category, required: k.required });
            }
        });

        foundKeywords = dedupeByTerm(foundKeywords);
        missingKeywords = dedupeByTerm(missingKeywords);

        // If the JD yielded no recognized requirements (no JD given, or a JD
        // with no dictionary-matched terms), fall back to a general scan of
        // the resume itself so the Keywords tab isn't empty (Fix 8: no JD /
        // no required skills edge case).
        if (jdKeywords.length === 0) {
            const scanned = [];
            Object.entries(TAXONOMY).forEach(([cat, list]) => {
                list.forEach(canonical => {
                    if (termFoundIn(lower, canonical)) {
                        const ev = findEvidence(content, canonical);
                        scanned.push({ term: displayTerm(canonical), category: CATEGORY_LABELS[cat], required: null, evidence: ev.snippet, section: ev.section });
                    }
                });
            });
            foundKeywords = dedupeByTerm(scanned);
            missingKeywords = [];
        }

        // -- ATS Compatibility Estimate --
        let atsScore = 55;
        if (presentSections.length >= 4) {
            atsScore += 20;
            atsChecks.push({ pass: true, text: `Clear section headings found: ${presentSections.join(', ')}` });
            strengths.push({ text: `Resume is organized into clearly labeled sections (${presentSections.join(', ')}), which supports accurate ATS parsing.`, category: 'ats' });
        } else if (presentSections.length >= 2) {
            atsScore += 10;
            atsChecks.push({ pass: true, text: `Some section headings found: ${presentSections.join(', ')}` });
        } else {
            atsChecks.push({ pass: false, text: 'Missing standard section headings (Experience, Education, Skills)' });
            improvements.push({ text: 'Few or no standard section headings were detected. ATS systems rely on headings like Experience, Education, and Skills to correctly categorize your content.', category: 'ats', suggestion: 'PROFESSIONAL EXPERIENCE\n• [Job Title] at [Company] (Year–Year)\n\nEDUCATION\n• [Degree] — [University] (Year)' });
        }

        const hasContact = /@/.test(content) || /\(\d{3}\)|\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/.test(content);
        if (hasContact) { atsScore += 8; atsChecks.push({ pass: true, text: 'Contact information detected (email/phone)' }); }
        else { atsChecks.push({ pass: false, text: 'No contact information detected' }); improvements.push({ text: 'No email address or phone number was detected. Recruiters and ATS systems need this to reach you.', category: 'ats' }); }

        const firstLine = (content.split('\n').find(l => l.trim().length > 0) || '').trim();
        const hasName = firstLine.length > 2 && firstLine.length < 50;
        if (hasName) { atsChecks.push({ pass: true, text: 'Name appears at top of resume' }); atsScore += 5; }

        const hasImageRef = /\.(jpg|jpeg|png|gif)\b/i.test(content) || /\b(photo|headshot)\b/i.test(content);
        if (!hasImageRef) { atsChecks.push({ pass: true, text: 'No embedded images detected (ATS-friendly)' }); atsScore += 3; }
        else { atsChecks.push({ pass: false, text: 'Possible image/photo reference detected — ATS systems cannot reliably parse images' }); improvements.push({ text: 'Avoid photos or embedded images. Most ATS systems cannot read them, and they can disrupt parsing of nearby text.', category: 'ats' }); }

        // Only recommend adding Skills/Experience sections if they are
        // genuinely absent (Fix 3) — never when already present.
        if (!presentSections.includes('skills')) {
            improvements.push({ text: 'No dedicated Skills section was found. This matters because ATS systems and recruiters scan a Skills section first to quickly verify technical qualifications.', category: 'ats', suggestion: 'SKILLS\n• [Skill], [Skill], [Skill]' });
        }
        if (!presentSections.includes('experience')) {
            improvements.push({ text: 'No dedicated Experience section was found. This is typically the most heavily weighted section for both ATS parsing and recruiter review.', category: 'ats' });
        }

        // Job-relevance factor — required vs. preferred kept separate so a
        // candidate is never penalized for lacking an optional skill (Fix 6).
        if (requiredTotal + preferredTotal > 0) {
            const reqPct = requiredTotal ? Math.round((requiredMatched / requiredTotal) * 100) : 100;
            const prefPct = preferredTotal ? Math.round((preferredMatched / preferredTotal) * 100) : 100;
            const blendedPct = requiredTotal ? reqPct : prefPct;
            atsScore = Math.round(atsScore * 0.55 + blendedPct * 0.45);

            atsChecks.push({ pass: reqPct >= 60, text: `Required-skill alignment with job description: ${reqPct}% (${requiredMatched}/${requiredTotal} required skills found)` });
            if (preferredTotal > 0) {
                atsChecks.push({ pass: true, text: `Preferred-skill alignment: ${prefPct}% (${preferredMatched}/${preferredTotal} preferred skills found) — preferred skills are optional and not required.` });
            }
            if (requiredTotal > 0 && reqPct < 60) {
                const missingReq = missingKeywords.filter(k => k.required).map(k => k.term);
                if (missingReq.length) {
                    improvements.push({ text: `This role lists ${requiredTotal} required skill(s), and your resume doesn't explicitly mention: ${missingReq.slice(0, 6).join(', ')}. If you have genuine hands-on experience with these, add them explicitly; if not, lean into the required skills you do have rather than adding unsupported claims.`, category: 'ats' });
                }
            }
        }

        atsScore = clamp(atsScore, 20, 98);
        scores.ats = atsScore;

        // -- Keywords Score --
        let keywordsScore = 45;
        const requiredFoundCount = foundKeywords.filter(k => k.required === true).length;
        const preferredFoundCount = foundKeywords.filter(k => k.required === false).length;
        const softFoundCount = foundKeywords.filter(k => k.category === CATEGORY_LABELS.softSkills).length;

        const verbs = ['led', 'developed', 'implemented', 'managed', 'designed', 'created', 'improved', 'increased', 'reduced', 'delivered', 'built', 'launched', 'optimized', 'achieved', 'spearheaded', 'architected', 'mentored', 'streamlined', 'orchestrated', 'established'];
        const verbsFound = verbs.filter(v => lower.includes(v));

        keywordsScore += requiredFoundCount * 3 + preferredFoundCount * 1.5 + softFoundCount * 2 + verbsFound.length * 1.5;

        if (requiredTotal > 0 && requiredFoundCount >= Math.ceil(requiredTotal * 0.7)) {
            strengths.push({ text: `Resume explicitly demonstrates ${requiredFoundCount} of the ${requiredTotal} required skills listed in the job description.`, category: 'keywords' });
        }
        if (verbsFound.length >= 4) {
            strengths.push({ text: `Bullet points consistently open with strong action verbs (e.g., "${verbsFound.slice(0, 3).join('", "')}").`, category: 'keywords' });
        }
        if (requiredTotal > 0 && requiredFoundCount < Math.ceil(requiredTotal * 0.3)) {
            improvements.push({ text: `Only ${requiredFoundCount} of ${requiredTotal} required skills from the job description were found in this resume. This matters because required skills are typically used as initial screening criteria. Add any of these you genuinely have experience with — don't add ones you don't.`, category: 'keywords' });
        }
        if (softFoundCount === 0 && jdKeywords.some(k => k.category === CATEGORY_LABELS.softSkills)) {
            improvements.push({ text: 'The job description emphasizes soft skills (e.g., collaboration, communication) that aren\'t evident in your resume text. Consider whether your bullet points can naturally reflect this kind of work.', category: 'keywords' });
        }
        if (verbsFound.length < 3) {
            improvements.push({ text: 'Several bullet points may rely on passive or vague phrasing rather than strong action verbs.', category: 'content', suggestion: 'Replace weak openers: "Responsible for..." → "Led...", "Helped with..." → "Delivered..."' });
        }

        keywordsScore = clamp(keywordsScore, 20, 97);
        scores.keywords = keywordsScore;

        // -- Format Score --
        let formatScore = 50;
        if (wordCount >= 150 && wordCount <= 700) { formatScore += 18; strengths.push({ text: `Resume length is appropriate (${wordCount} words).`, category: 'format' }); }
        else if (wordCount < 150) { improvements.push({ text: `Resume is quite short (${wordCount} words). This matters because a thin resume gives ATS and recruiters little to match against. Aim for roughly 300–600 words.`, category: 'format' }); }
        else { improvements.push({ text: `Resume may be too long (${wordCount} words), which can dilute your strongest points. Condense to 1–2 pages.`, category: 'format', suggestion: 'Remove older or less relevant positions. Focus on the last 10–15 years.' }); }

        const hasBullets = content.includes('•') || content.includes('- ') || content.includes('* ');
        if (hasBullets) { formatScore += 12; strengths.push({ text: 'Uses bullet points, which improves scannability for both recruiters and ATS parsers.', category: 'format' }); }
        else { improvements.push({ text: 'Content appears to be in paragraph form rather than bullet points, which is harder to scan quickly.', category: 'format', suggestion: '• Bullet points are preferred by most recruiters\n• Keep each bullet to 1–2 lines\n• Start with an action verb' }); }

        if (lineCount > 15) formatScore += 8;

        const hasLinks = lower.includes('linkedin') || lower.includes('github') || lower.includes('portfolio');
        if (hasLinks) { formatScore += 4; strengths.push({ text: 'Includes a professional profile link (LinkedIn/GitHub/portfolio).', category: 'format' }); }
        else { improvements.push({ text: 'No LinkedIn, GitHub, or portfolio link was found. This is a minor, optional improvement, not a requirement.', category: 'format' }); }

        formatScore = clamp(formatScore, 20, 96);
        scores.format = formatScore;

        // -- Content Score --
        let contentScore = 45;
        const hasNumbers = content.match(/\d+%|\$[\d,.]+|\d+\+|\d+ (years?|months?|projects?|clients?|users?|team|people|members?|engineers?)/gi);
        if (hasNumbers && hasNumbers.length >= 3) {
            contentScore += 25;
            strengths.push({ text: `Includes ${hasNumbers.length} quantified results.`, category: 'content', evidence: hasNumbers.slice(0, 3).join(', ') });
        } else if (hasNumbers && hasNumbers.length > 0) {
            contentScore += 12;
            improvements.push({ text: 'A few quantified achievements are present, but more would make your impact more concrete.', category: 'content', suggestion: 'Instead of: "Improved system performance"\nWrite: "Improved system performance by 40%, reducing page load time from 3.2s to 1.9s"' });
        } else {
            improvements.push({ text: 'No quantified achievements (numbers, percentages, metrics) were detected. This matters because concrete numbers are what let a reviewer judge scale and impact.', category: 'content', suggestion: '• "Managed a team of 12 engineers across 3 time zones"\n• "Increased revenue by 25% ($2.4M) through feature optimization"\n• "Reduced deployment time by 60% using CI/CD automation"' });
        }

        if (verbsFound.length >= 3) contentScore += 10;

        if (lower.includes('achieved') || lower.includes('accomplished') || lower.includes('exceeded') || lower.includes('award')) {
            contentScore += 8;
            strengths.push({ text: 'Resume text explicitly highlights achievements or recognition (e.g., "achieved", "exceeded", "award").', category: 'content' });
        }

        const vagueTerms = ['responsible for', 'duties included', 'helped with', 'assisted in', 'participated in', 'was involved'];
        const vagueFound = vagueTerms.filter(v => lower.includes(v));
        if (vagueFound.length > 0) {
            contentScore -= vagueFound.length * 3;
            improvements.push({ text: `Found vague phrasing: "${vagueFound.join('", "')}". This matters because vague phrasing obscures your actual role and impact.`, category: 'content', suggestion: `Replace "${vagueFound[0]}" with a specific action verb like "Led", "Developed", "Implemented".` });
        }

        contentScore = clamp(contentScore, 20, 95);
        scores.content = contentScore;

        // -- Grammar Score --
        let grammarScore = 60;
        const doubleSpaces = (content.match(/  +/g) || []).length;
        if (doubleSpaces > 5) {
            grammarScore -= 8;
            improvements.push({ text: 'Inconsistent spacing detected (multiple double spaces).', category: 'grammar' });
        } else { grammarScore += 8; }

        if (!lower.includes('i am') && !lower.includes("i'm") && !lower.includes('my ') && !lower.includes('i ')) {
            grammarScore += 12;
            strengths.push({ text: 'Maintains a professional third-person tone throughout, with no first-person pronouns detected.', category: 'grammar' });
        } else {
            improvements.push({ text: 'First-person pronouns (I, my, me) were detected. Most resumes use an implied third-person, professional tone.', category: 'grammar', suggestion: 'Instead of: "I managed a team of 5"\nWrite: "Managed a team of 5 engineers"' });
        }

        const pastTense = (content.match(/\b(led|developed|managed|created|built|achieved|designed|implemented)\b/gi) || []).length;
        const presentTense = (content.match(/\b(lead|develop|manage|create|build|achieve|design|implement)\b/gi) || []).length;
        if (pastTense > 0 && presentTense > 0 && Math.abs(pastTense - presentTense) < 2) {
            improvements.push({ text: 'Possible inconsistent tense usage — use past tense for previous roles and present tense only for your current role.', category: 'grammar' });
        } else { grammarScore += 5; }

        grammarScore = clamp(grammarScore, 25, 98);
        scores.grammar = grammarScore;

        if (lower.includes('certif')) strengths.push({ text: 'Resume text references relevant certifications.', category: 'keywords' });
        if (lower.includes('award') || lower.includes('recognition') || lower.includes('honor')) strengths.push({ text: 'Resume text references awards or recognition.', category: 'content' });

        // Add resume-section evidence to keyword-based strengths (Fix 2:
        // strengths must cite where in the resume the evidence lives).
        foundKeywords.filter(k => k.required !== false).slice(0, 6).forEach(k => {
            if (k.evidence) {
                strengths.push({
                    text: `"${k.term}" (${k.category}) is explicitly mentioned in the resume${k.section ? ', in the ' + k.section + ' section' : ''}.`,
                    category: 'keywords',
                    evidence: k.evidence,
                    section: k.section,
                });
            }
        });

        const tips = [
            { title: 'Tailor for Each Job', desc: 'Mirror the specific required skills and terminology from each job description.' },
            { title: 'Use the STAR Method', desc: 'Structure achievements as Situation, Task, Action, Result.' },
            { title: 'Optimize for ATS', desc: 'Use standard section headings and avoid tables/images that ATS parsers struggle with.' },
            { title: 'Keep It Concise', desc: 'Recruiters scan quickly — lead with your strongest, most relevant points.' },
        ];
        if (requiredTotal > 0 && requiredFoundCount < requiredTotal) {
            tips.push({ title: 'Address Required Gaps', desc: 'Review the missing required skills — only add ones you genuinely have experience with.' });
        }
        if (!hasNumbers || hasNumbers.length < 3) {
            tips.push({ title: 'Quantify Everything', desc: '"Managed a team of 12" is stronger than "Managed a team".' });
        }

        const overall = Math.round(
            scores.ats * 0.25 + scores.keywords * 0.2 + scores.format * 0.2 + scores.content * 0.2 + scores.grammar * 0.15
        );

        let verdict, summary;
        if (overall >= 85) { verdict = 'Excellent Resume! 🌟'; summary = 'Well-optimized and ready for top positions.'; }
        else if (overall >= 70) { verdict = 'Strong Resume 💪'; summary = 'Good foundation with a few areas to polish.'; }
        else if (overall >= 55) { verdict = 'Room to Improve 📈'; summary = 'Follow suggestions below to significantly boost your score.'; }
        else { verdict = 'Needs Work 🔧'; summary = 'Needs several improvements. Focus on recommendations below.'; }

        return {
            overall, scores, verdict, summary,
            strengths: strengths.slice(0, 8),
            improvements: improvements.slice(0, 10),
            foundKeywords: foundKeywords.slice(0, 20),
            missingKeywords: missingKeywords.slice(0, 20),
            tips: tips.slice(0, 6),
            atsChecks,
            wordCount,
            requiredTotal, requiredMatched, preferredTotal, preferredMatched,
        };
    }

    // ===========================
    // RANKING DASHBOARD
    // ===========================
    function showRankingDashboard(minScore = 0) {
        // Sort by overall desc
        bulkResults.sort((a, b) => b.overall - a.overall);

        rankingSection.style.display = 'block';
        rankingSection.scrollIntoView({ behavior: 'smooth' });

        // Summary
        document.getElementById('total-candidates').textContent = bulkResults.length;
        const avgAts = Math.round(bulkResults.reduce((s, r) => s + r.scores.ats, 0) / bulkResults.length);
        document.getElementById('avg-ats').textContent = avgAts + '%';
        document.getElementById('top-score').textContent = bulkResults[0]?.overall || 0;
        document.getElementById('below-threshold').textContent = bulkResults.filter(r => r.overall < (minScore || 50)).length;

        renderRankingTable();
        setupRankingControls();
    }

    function renderRankingTable() {
        const tbody = document.getElementById('rank-table-body');
        tbody.innerHTML = '';

        let filtered = [...bulkResults];

        // Filter
        if (activeFilter === 'pass') filtered = filtered.filter(r => r.scores.ats >= 70);
        else if (activeFilter === 'review') filtered = filtered.filter(r => r.scores.ats >= 50 && r.scores.ats < 70);
        else if (activeFilter === 'fail') filtered = filtered.filter(r => r.scores.ats < 50);

        // Sort
        filtered.sort((a, b) => {
            const valA = sortField === 'overall' ? a.overall : a.scores[sortField];
            const valB = sortField === 'overall' ? b.overall : b.scores[sortField];
            return sortAsc ? valA - valB : valB - valA;
        });

        filtered.forEach((r, i) => {
            const rank = i + 1;
            const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank;
            const statusClass = r.scores.ats >= 70 ? 'pass' : r.scores.ats >= 50 ? 'review' : 'fail';
            const statusText = r.scores.ats >= 70 ? '✓ Pass' : r.scores.ats >= 50 ? '⚠ Review' : '✕ Fail';
            const displayName = r.fileName.replace(/\.(pdf|txt|doc|docx)$/i, '').replace(/[-_]/g, ' ');

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="td-rank">${typeof medal === 'string' && medal.length > 2 ? `<span class="rank-medal">${medal}</span>` : medal}</td>
                <td class="td-name" title="${r.fileName}">${displayName}</td>
                <td class="td-score"><span class="score-pill ${pillClass(r.overall)}">${r.overall}</span></td>
                <td class="td-score"><span class="score-pill ${pillClass(r.scores.ats)}">${r.scores.ats}</span></td>
                <td class="td-score"><span class="score-pill ${pillClass(r.scores.keywords)}">${r.scores.keywords}</span></td>
                <td class="td-score"><span class="score-pill ${pillClass(r.scores.content)}">${r.scores.content}</span></td>
                <td class="td-score"><span class="score-pill ${pillClass(r.scores.format)}">${r.scores.format}</span></td>
                <td class="td-score"><span class="score-pill ${pillClass(r.scores.grammar)}">${r.scores.grammar}</span></td>
                <td class="td-status"><span class="status-badge ${statusClass}">${statusText}</span></td>
                <td class="td-action"><button class="detail-btn" data-idx="${bulkResults.indexOf(r)}">View</button></td>
            `;
            tbody.appendChild(tr);
        });

        // Detail buttons
        tbody.querySelectorAll('.detail-btn').forEach(btn => {
            btn.addEventListener('click', () => openDetailModal(parseInt(btn.dataset.idx)));
        });
    }

    function pillClass(score) {
        if (score >= 70) return 'high';
        if (score >= 50) return 'mid';
        return 'low';
    }

    function setupRankingControls() {
        // Sort
        const sortSelect = document.getElementById('sort-by');
        sortSelect.addEventListener('change', () => { sortField = sortSelect.value; renderRankingTable(); });

        const sortDirBtn = document.getElementById('sort-dir-btn');
        sortDirBtn.addEventListener('click', () => { sortAsc = !sortAsc; sortDirBtn.style.transform = sortAsc ? 'scaleY(-1)' : ''; renderRankingTable(); });

        // Filters
        document.querySelectorAll('.filter-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                activeFilter = chip.dataset.filter;
                renderRankingTable();
            });
        });

        // Export
        document.getElementById('export-btn').addEventListener('click', exportCSV);

        // Analyze another
        document.getElementById('bulk-again-btn').addEventListener('click', () => {
            rankingSection.style.display = 'none';
            bulkUploadSection.style.display = 'block';
            bulkFiles = [];
            bulkResults = [];
            renderQueue();
            bulkUploadSection.scrollIntoView({ behavior: 'smooth' });
        });
    }

    function exportCSV() {
        const headers = ['Rank', 'Candidate', 'Overall', 'ATS', 'Keywords', 'Content', 'Format', 'Grammar', 'Status'];
        const sorted = [...bulkResults].sort((a, b) => b.overall - a.overall);
        const rows = sorted.map((r, i) => [
            i + 1,
            `"${r.fileName}"`,
            r.overall,
            r.scores.ats,
            r.scores.keywords,
            r.scores.content,
            r.scores.format,
            r.scores.grammar,
            r.scores.ats >= 70 ? 'Pass' : r.scores.ats >= 50 ? 'Review' : 'Fail'
        ]);

        const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'resume_ranking_report.csv';
        a.click();
        URL.revokeObjectURL(url);
    }

    // ===========================
    // DETAIL MODAL
    // ===========================
    const modal = document.getElementById('detail-modal');
    const modalClose = document.getElementById('modal-close');

    modalClose.addEventListener('click', () => modal.style.display = 'none');
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') modal.style.display = 'none'; });

    // Modal tabs
    document.querySelectorAll('.modal-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.modal-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.modal-panel').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(`mpanel-${tab.dataset.mtab}`).classList.add('active');
        });
    });

    function keywordTagHtml(k, isMissing) {
        const badge = k.required === true ? 'Required' : k.required === false ? 'Preferred' : '';
        const titleParts = [k.category, badge].filter(Boolean);
        const suffix = isMissing && k.required === false ? ' <small>(preferred)</small>' : '';
        return `<span class="keyword-tag" title="${titleParts.join(' • ')}">${k.term}${suffix}</span>`;
    }

    function openDetailModal(idx) {
        const r = bulkResults[idx];
        const rank = bulkResults.sort((a, b) => b.overall - a.overall).indexOf(r) + 1;

        document.getElementById('modal-rank').textContent = `#${rank}`;
        document.getElementById('modal-candidate-name').textContent = r.fileName.replace(/\.(pdf|txt|doc|docx)$/i, '').replace(/[-_]/g, ' ');

        // Score ring
        const circumference = 2 * Math.PI * 52;
        const ring = document.getElementById('modal-ring-progress');
        const scoreNum = document.getElementById('modal-overall-score');
        scoreNum.textContent = r.overall;
        setTimeout(() => {
            ring.style.strokeDasharray = `${(r.overall / 100) * circumference} ${circumference}`;
        }, 100);

        // Category scores
        const catScores = document.getElementById('modal-cat-scores');
        const cats = [
            { name: 'ATS', key: 'ats', color: '#818cf8' },
            { name: 'Keywords', key: 'keywords', color: '#c084fc' },
            { name: 'Format', key: 'format', color: '#34d399' },
            { name: 'Content', key: 'content', color: '#f472b6' },
            { name: 'Grammar', key: 'grammar', color: '#fb923c' },
        ];
        catScores.innerHTML = cats.map(c => `
            <div class="modal-cat-row">
                <span class="modal-cat-name">${c.name}</span>
                <div class="modal-cat-bar"><div class="modal-cat-bar-fill" style="width:${r.scores[c.key]}%;background:${c.color};"></div></div>
                <span class="modal-cat-val">${r.scores[c.key]}%</span>
            </div>
        `).join('');

        // Improvements
        const impList = document.getElementById('modal-improvements');
        impList.innerHTML = r.improvements.length ? r.improvements.map(imp => `
            <div class="improvement-item">
                <div class="imp-header">
                    <span class="imp-icon">⚠️</span>
                    <span class="imp-category ${imp.category}">${imp.category}</span>
                </div>
                <div class="imp-text">${imp.text}</div>
                ${imp.suggestion ? `<div class="imp-suggestion">💡 Suggestion:\n${imp.suggestion}</div>` : ''}
            </div>
        `).join('') : '<p style="color:var(--text-muted);font-size:0.85rem;">No significant issues detected relative to this job description.</p>';

        // Strengths
        const strList = document.getElementById('modal-strengths');
        strList.innerHTML = r.strengths.length ? r.strengths.map(s => `
            <div class="improvement-item">
                <div class="imp-header">
                    <span class="imp-icon">✅</span>
                    <span class="imp-category ${s.category}">${s.category}</span>
                </div>
                <div class="imp-text">${s.text}</div>
                ${s.evidence ? `<div class="imp-suggestion">📌 Evidence: "${s.evidence}"${s.section ? ' — ' + s.section + ' section' : ''}</div>` : ''}
            </div>
        `).join('') : '<p style="color:var(--text-muted);font-size:0.85rem;">No strong, evidence-backed highlights were identified from the current resume/JD comparison.</p>';

        // Keywords
        const foundKw = document.getElementById('modal-found-kw');
        foundKw.innerHTML = r.foundKeywords.map(k => keywordTagHtml(k, false)).join('');
        if (r.foundKeywords.length === 0) foundKw.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;">No specific keywords detected.</p>';

        const missingKw = document.getElementById('modal-missing-kw');
        missingKw.innerHTML = r.missingKeywords.map(k => keywordTagHtml(k, true)).join('');
        if (r.missingKeywords.length === 0) missingKw.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;">All identified key requirements are covered!</p>';

        // ATS Details — always labeled as an estimate, never a real ATS score.
        const atsDetails = document.getElementById('modal-ats-details');
        const noteHtml = `
            <div class="ats-detail-item">
                <div class="ats-check pass">ℹ️</div>
                <span class="ats-detail-text">This is an <strong>ATS Compatibility Estimate</strong> based on structure and keyword signals in your document — not an official score from any specific company's ATS software.</span>
            </div>`;
        atsDetails.innerHTML = noteHtml + r.atsChecks.map(c => `
            <div class="ats-detail-item">
                <div class="ats-check ${c.pass ? 'pass' : 'fail'}">${c.pass ? '✓' : '✕'}</div>
                <span class="ats-detail-text">${c.text}</span>
            </div>
        `).join('');

        // Reset to first tab
        document.querySelectorAll('.modal-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.modal-panel').forEach(p => p.classList.remove('active'));
        document.querySelector('.modal-tab').classList.add('active');
        document.getElementById('mpanel-improvements').classList.add('active');

        modal.style.display = 'flex';
    }


    // ===========================
    // SINGLE RESUME ANALYSIS
    // ===========================
    const singleTabs = document.querySelectorAll('#single-upload .upload-tab');
    const singlePanels = document.querySelectorAll('#single-upload .tab-panel');
    singleTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            singleTabs.forEach(t => t.classList.remove('active'));
            singlePanels.forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(`panel-${tab.dataset.tab}`).classList.add('active');
        });
    });

    // Single file upload
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const filePreview = document.getElementById('file-preview');
    const fileNameEl = document.getElementById('file-name');
    const fileSizeEl = document.getElementById('file-size');
    const fileRemoveBtn = document.getElementById('file-remove');
    let singleFile = null;

    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', e => { e.preventDefault(); dropZone.classList.remove('drag-over'); if (e.dataTransfer.files.length) handleSingleFile(e.dataTransfer.files[0]); });
    fileInput.addEventListener('change', () => { if (fileInput.files.length) handleSingleFile(fileInput.files[0]); });

    function handleSingleFile(file) {
        singleFile = file;
        fileNameEl.textContent = file.name;
        fileSizeEl.textContent = formatSize(file.size);
        dropZone.style.display = 'none';
        filePreview.style.display = 'block';
    }

    fileRemoveBtn.addEventListener('click', () => {
        singleFile = null;
        fileInput.value = '';
        dropZone.style.display = 'block';
        filePreview.style.display = 'none';
    });

    // Single analyze
    const singleAnalyzeBtn = document.getElementById('single-analyze-btn');
    const singleUpload = document.getElementById('single-upload');
    const singleLoading = document.getElementById('single-loading');
    const singleResults = document.getElementById('single-results');
    const singleProgressBar = document.getElementById('single-progress-bar');
    const singleLoaderStatus = document.getElementById('single-loader-status');
    const resumeText = document.getElementById('resume-text');

    singleAnalyzeBtn.addEventListener('click', async () => {
        const activeTab = document.querySelector('#single-upload .upload-tab.active').dataset.tab;
        let content = '';

        if (activeTab === 'text') {
            content = resumeText.value.trim();
            if (!content) { alert('Please paste your resume text.'); return; }
        } else if (singleFile) {
            try {
                content = await extractTextFromFile(singleFile);
            } catch (e) {
                content = `[Content from ${singleFile.name}]`;
            }
        } else {
            alert('Please upload a file first.');
            return;
        }

        singleUpload.style.display = 'none';
        singleLoading.style.display = 'block';
        singleLoading.scrollIntoView({ behavior: 'smooth', block: 'center' });

        const stages = [
            { text: 'Parsing document structure...', progress: 15 },
            { text: 'Extracting keywords & skills...', progress: 35 },
            { text: 'Analyzing ATS compatibility...', progress: 55 },
            { text: 'Evaluating content quality...', progress: 75 },
            { text: 'Generating recommendations...', progress: 90 },
            { text: 'Finalizing report...', progress: 100 },
        ];

        singleProgressBar.style.width = '0%';
        let idx = 0;
        const advance = () => {
            if (idx < stages.length) {
                singleLoaderStatus.textContent = stages[idx].text;
                singleProgressBar.style.width = stages[idx].progress + '%';
                idx++;
                setTimeout(advance, 500 + Math.random() * 300);
            } else {
                setTimeout(() => showSingleResults(content), 400);
            }
        };
        setTimeout(advance, 200);
    });

    function showSingleResults(content) {
        const r = analyzeResume(content);

        singleLoading.style.display = 'none';
        singleResults.style.display = 'block';
        singleResults.scrollIntoView({ behavior: 'smooth' });

        // Score ring
        const circumference = 2 * Math.PI * 52;
        const ring = document.getElementById('single-ring-progress');
        const scoreEl = document.getElementById('s-overall-score');
        animateNumber(scoreEl, 0, r.overall, 1500);
        setTimeout(() => {
            ring.style.strokeDasharray = `${(r.overall / 100) * circumference} ${circumference}`;
        }, 100);

        document.getElementById('s-score-verdict').textContent = r.verdict;
        document.getElementById('s-score-summary').textContent = r.summary;

        // Category bars
        const catData = [
            { val: 's-cat-ats-val', bar: 's-cat-ats-bar', score: r.scores.ats },
            { val: 's-cat-kw-val', bar: 's-cat-kw-bar', score: r.scores.keywords },
            { val: 's-cat-fmt-val', bar: 's-cat-fmt-bar', score: r.scores.format },
            { val: 's-cat-cnt-val', bar: 's-cat-cnt-bar', score: r.scores.content },
            { val: 's-cat-gram-val', bar: 's-cat-gram-bar', score: r.scores.grammar },
        ];
        catData.forEach((c, i) => {
            setTimeout(() => {
                document.getElementById(c.val).textContent = c.score + '%';
                document.getElementById(c.bar).style.width = c.score + '%';
            }, 200 + i * 150);
        });

        // Strengths
        const sList = document.getElementById('s-strengths-list');
        sList.innerHTML = r.strengths.length
            ? r.strengths.map(s => `<li><span class="finding-icon">✅</span><span>${s.text}${s.evidence ? '<br><em style="color:var(--text-muted);font-size:0.8rem;">📌 "' + s.evidence + '"' + (s.section ? ' — ' + s.section + ' section' : '') + '</em>' : ''}</span></li>`).join('')
            : '<li><span class="finding-icon">ℹ️</span><span>No strong, evidence-backed highlights were identified from the current resume/JD comparison.</span></li>';

        // Improvements
        const iList = document.getElementById('s-improvements-list');
        iList.innerHTML = r.improvements.length
            ? r.improvements.map(imp => `<li><span class="finding-icon">⚠️</span><span>${imp.text}${imp.suggestion ? '<br><em style="color:var(--accent-emerald);font-size:0.8rem;">💡 ' + imp.suggestion.split('\n')[0] + '</em>' : ''}</span></li>`).join('')
            : '<li><span class="finding-icon">✅</span><span>No significant issues detected relative to this job description.</span></li>';

        // Keywords
        const fKw = document.getElementById('s-found-kw');
        fKw.innerHTML = r.foundKeywords.map(k => keywordTagHtml(k, false)).join('') || '<p style="color:var(--text-muted);font-size:0.85rem;">No specific keywords detected.</p>';

        const mKw = document.getElementById('s-missing-kw');
        mKw.innerHTML = r.missingKeywords.map(k => keywordTagHtml(k, true)).join('');
        if (r.missingKeywords.length === 0) mKw.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;">All identified key requirements are covered!</p>';

        // Tips
        const tipsGrid = document.getElementById('s-tips-grid');
        tipsGrid.innerHTML = r.tips.map((t, i) => `
            <div class="tip-card fade-in visible">
                <div class="tip-number">${String(i + 1).padStart(2, '0')}</div>
                <div class="tip-content"><h4>${t.title}</h4><p>${t.desc}</p></div>
            </div>
        `).join('');
    }

    document.getElementById('single-again-btn').addEventListener('click', () => {
        singleResults.style.display = 'none';
        singleUpload.style.display = 'block';
        singleFile = null;
        fileInput.value = '';
        dropZone.style.display = 'block';
        filePreview.style.display = 'none';
        resumeText.value = '';
        singleUpload.scrollIntoView({ behavior: 'smooth' });
    });

    function animateNumber(el, from, to, duration) {
        const start = performance.now();
        const update = (now) => {
            const p = Math.min((now - start) / duration, 1);
            el.textContent = Math.floor(from + (to - from) * (1 - Math.pow(1 - p, 3)));
            if (p < 1) requestAnimationFrame(update);
        };
        requestAnimationFrame(update);
    }

});