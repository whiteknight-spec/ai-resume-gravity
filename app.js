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

        const jdText = document.getElementById('jd-input') ? document.getElementById('jd-input').value.trim() : '';
        const minScoreInput = document.getElementById('jd-min-score');
        const minScore = minScoreInput ? (parseInt(minScoreInput.value) || 0) : 0;

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
    // ===========================================================
    const TAXONOMY = {
        languages: ['javascript', 'typescript', 'python', 'java', 'c++', 'c#', 'ruby', 'php', 'go', 'rust', 'swift', 'kotlin', 'scala', 'r', 'sql', 'html', 'css', 'shell', 'bash'],
        frameworks: ['react', 'angular', 'vue', 'node', 'express', 'django', 'flask', 'spring', 'laravel', 'rails', 'next.js', 'nuxt', 'svelte', 'dotnet', 'fastapi', 'tailwind', 'pandas'],
        tools: ['git', 'docker', 'kubernetes', 'jenkins', 'terraform', 'ansible', 'webpack', 'jira', 'figma', 'postman', 'jest', 'cypress', 'excel'],
        platforms: ['aws', 'azure', 'gcp', 'firebase', 'heroku', 'vercel', 'netlify'],
        databases: ['mongodb', 'postgresql', 'mysql', 'redis', 'sqlite', 'oracle', 'dynamodb', 'cassandra', 'elasticsearch'],
        practices: ['agile', 'scrum', 'devops', 'ci/cd', 'microservices', 'rest', 'graphql', 'tdd', 'object-oriented programming', 'machine learning', 'natural language processing', 'automated testing'],
        roleTerms: ['stakeholder management', 'product roadmap', 'go-to-market', 'a/b testing', 'user research', 'sprint planning', 'api design', 'system design', 'distributed systems', 'data pipeline', 'incident response', 'code review', 'web features'],
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

    const ALIASES = {
        'js': 'javascript', 'ecmascript': 'javascript',
        'ts': 'typescript',
        'c plus plus': 'c++', 'cpp': 'c++',
        'c sharp': 'c#', 'csharp': 'c#',
        'python programming': 'python', 'python3': 'python', 'python 3': 'python',
        'structured query language': 'sql', 'relational databases': 'sql', 'relational database': 'sql', 'rdbms': 'sql',
        'microsoft excel': 'excel', 'ms excel': 'excel',
        'node.js': 'node', 'nodejs': 'node',
        'react.js': 'react', 'reactjs': 'react',
        'vue.js': 'vue', 'vuejs': 'vue',
        'k8s': 'kubernetes',
        'amazon web services': 'aws', 'cloud platform': 'aws',
        'google cloud platform': 'gcp', 'google cloud': 'gcp',
        'microsoft azure': 'azure',
        'postgres': 'postgresql', 'psql': 'postgresql',
        'cicd': 'ci/cd', 'ci / cd': 'ci/cd', 'continuous integration': 'ci/cd', 'continuous deployment': 'ci/cd',
        'ml': 'machine learning',
        'nlp': 'natural language processing',
        'oop': 'object-oriented programming', 'object oriented programming': 'object-oriented programming',
        'problem solving': 'problem-solving',
        '.net': 'dotnet',
        'tailwind css': 'tailwind', 'tailwindcss': 'tailwind',
        'fast api': 'fastapi',
        'rest api': 'rest', 'rest apis': 'rest', 'restful': 'rest', 'restful apis': 'rest', 'api development': 'rest', 'apis': 'rest', 'backend apis': 'rest',
        'github': 'git', 'version control': 'git',
        'unit tests': 'automated testing', 'debugging and testing': 'automated testing', 'testing': 'automated testing', 'debugging': 'automated testing',
        'agile teams': 'agile',
        'good communication': 'communication',
        'collaborate': 'collaboration', 'collaborated': 'collaboration'
    };

    const DISPLAY_NAMES = {
        javascript: 'JavaScript', typescript: 'TypeScript', python: 'Python', java: 'Java', 'c++': 'C++', 'c#': 'C#',
        ruby: 'Ruby', php: 'PHP', go: 'Go', rust: 'Rust', swift: 'Swift', kotlin: 'Kotlin', scala: 'Scala', r: 'R',
        sql: 'SQL', html: 'HTML', css: 'CSS', shell: 'Shell', bash: 'Bash',
        react: 'React', angular: 'Angular', vue: 'Vue.js', node: 'Node.js', express: 'Express', django: 'Django',
        flask: 'Flask', spring: 'Spring', laravel: 'Laravel', rails: 'Ruby on Rails', 'next.js': 'Next.js',
        nuxt: 'Nuxt.js', svelte: 'Svelte', dotnet: '.NET', fastapi: 'FastAPI', tailwind: 'Tailwind CSS', pandas: 'Pandas',
        git: 'Git', docker: 'Docker', kubernetes: 'Kubernetes', jenkins: 'Jenkins', terraform: 'Terraform',
        ansible: 'Ansible', webpack: 'Webpack', jira: 'Jira', figma: 'Figma', postman: 'Postman', jest: 'Jest',
        cypress: 'Cypress', excel: 'Excel',
        aws: 'AWS', azure: 'Azure', gcp: 'GCP', firebase: 'Firebase', heroku: 'Heroku', vercel: 'Vercel', netlify: 'Netlify',
        mongodb: 'MongoDB', postgresql: 'PostgreSQL', mysql: 'MySQL', redis: 'Redis', sqlite: 'SQLite', oracle: 'Oracle',
        dynamodb: 'DynamoDB', cassandra: 'Cassandra', elasticsearch: 'Elasticsearch',
        agile: 'Agile', scrum: 'Scrum', devops: 'DevOps', 'ci/cd': 'CI/CD', microservices: 'Microservices',
        rest: 'REST APIs', graphql: 'GraphQL', tdd: 'TDD', 'object-oriented programming': 'OOP',
        'machine learning': 'Machine Learning', 'natural language processing': 'NLP', 'automated testing': 'Testing / QA',
        'web features': 'Web Features',
        hipaa: 'HIPAA', gdpr: 'GDPR', 'pci-dss': 'PCI-DSS',
        communication: 'Communication', collaboration: 'Collaboration'
    };

    function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

    function variantsFor(canonical) {
        const set = new Set([canonical]);
        Object.entries(ALIASES).forEach(([alias, target]) => {
            if (target === canonical) set.add(alias);
        });
        return Array.from(set);
    }

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
        summary: /\b(professional summary|summary|profile|about me)\b/i,
        objective: /\bobjective\b/i,
        projects: /\bprojects?\b/i,
        certifications: /\bcertifications?\b/i,
        awards: /\bawards?\b/i,
    };

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
        let section = 'General';
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

        const presentSections = Object.entries(SECTION_PATTERNS)
            .filter(([, re]) => re.test(content))
            .map(([k]) => k);

        // Required vs Preferred matching
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

        // Fallback scan if JD is empty or has no recognized keywords
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

        // 1. ATS Compatibility Estimate
        let atsScore = 55;
        if (presentSections.length >= 3) {
            atsScore += 20;
            atsChecks.push({ pass: true, text: `Clear section headings found: ${presentSections.join(', ')}` });
            strengths.push({ text: `Resume is organized into clearly labeled sections (${presentSections.join(', ')}), which supports accurate ATS parsing.`, category: 'ats' });
        } else if (presentSections.length >= 1) {
            atsScore += 10;
            atsChecks.push({ pass: true, text: `Some section headings found: ${presentSections.join(', ')}` });
        } else {
            atsChecks.push({ pass: false, text: 'Missing standard section headings (Experience, Education, Skills)' });
            improvements.push({ text: 'Few or no standard section headings were detected. ATS systems rely on standard headers like Experience, Education, and Skills to categorize your background.', category: 'ats', suggestion: 'PROFESSIONAL EXPERIENCE\n• [Job Title] at [Company]\n\nEDUCATION\n• [Degree] — [University]' });
        }

        const hasContact = /@/.test(content) || /\(\d{3}\)|\d{3}[-.\s]?\d{3}[-.\s]?\d{4}|\+\d{1,3}[-.\s]?\d{4,}/.test(content);
        if (hasContact) {
            atsScore += 8;
            atsChecks.push({ pass: true, text: 'Contact information detected (email/phone)' });
        } else {
            atsChecks.push({ pass: false, text: 'No contact information detected' });
            improvements.push({ text: 'No contact details (email/phone) were found. Recruiters and parsing algorithms need this at the very top.', category: 'ats' });
        }

        const firstLine = (content.split('\n').find(l => l.trim().length > 0) || '').trim();
        const hasName = firstLine.length > 2 && firstLine.length < 50;
        if (hasName) { atsChecks.push({ pass: true, text: 'Candidate name appears at top of resume' }); atsScore += 5; }

        const hasImageRef = /\.(jpg|jpeg|png|gif)\b/i.test(content) || /\b(photo|headshot)\b/i.test(content);
        if (!hasImageRef) { atsChecks.push({ pass: true, text: 'No complex embedded images or graphic blocks detected' }); atsScore += 4; }
        else { atsChecks.push({ pass: false, text: 'Possible image/photo reference detected — ATS systems cannot reliably parse graphics' }); improvements.push({ text: 'Avoid photos or embedded graphics that can disrupt plain text parsing.', category: 'ats' }); }

        if (!presentSections.includes('skills')) {
            improvements.push({ text: 'No dedicated Technical Skills section was found. A standalone skills section helps ATS quickly index your competencies.', category: 'ats', suggestion: 'TECHNICAL SKILLS\n• Languages: ...\n• Frameworks: ...' });
        }
        if (!presentSections.includes('experience')) {
            improvements.push({ text: 'No dedicated Experience section was identified. This is the primary section reviewed by screening systems.', category: 'ats' });
        }

        if (requiredTotal + preferredTotal > 0) {
            const reqPct = requiredTotal ? Math.round((requiredMatched / requiredTotal) * 100) : 100;
            const prefPct = preferredTotal ? Math.round((preferredMatched / preferredTotal) * 100) : 100;
            const blendedPct = requiredTotal ? reqPct : prefPct;
            atsScore = Math.round(atsScore * 0.50 + blendedPct * 0.50);

            atsChecks.push({ pass: reqPct >= 60, text: `Required-skill alignment with job description: ${reqPct}% (${requiredMatched}/${requiredTotal} required skills found)` });
            if (preferredTotal > 0) {
                atsChecks.push({ pass: true, text: `Preferred-skill alignment: ${prefPct}% (${preferredMatched}/${preferredTotal} preferred skills found) — note: preferred skills are optional bonuses.` });
            }
            if (requiredTotal > 0 && reqPct < 60) {
                const missingReq = missingKeywords.filter(k => k.required).map(k => k.term);
                if (missingReq.length) {
                    improvements.push({ text: `The job description lists required competencies not explicitly found in your resume: ${missingReq.slice(0, 5).join(', ')}. Only add these if you have genuine experience with them.`, category: 'ats' });
                }
            }
        }

        atsScore = clamp(atsScore, 20, 98);
        scores.ats = atsScore;

        // 2. Keywords Score
        let keywordsScore = 45;
        const requiredFoundCount = foundKeywords.filter(k => k.required === true).length;
        const preferredFoundCount = foundKeywords.filter(k => k.required === false).length;
        const softFoundCount = foundKeywords.filter(k => k.category === CATEGORY_LABELS.softSkills).length;

        const verbs = ['led', 'developed', 'implemented', 'managed', 'designed', 'created', 'improved', 'increased', 'reduced', 'delivered', 'built', 'launched', 'optimized', 'achieved', 'spearheaded', 'architected', 'mentored', 'streamlined', 'orchestrated', 'established', 'integrated'];
        const verbsFound = verbs.filter(v => lower.includes(v));

        keywordsScore += requiredFoundCount * 4 + preferredFoundCount * 2 + softFoundCount * 2.5 + verbsFound.length * 1.5;

        if (requiredTotal > 0 && requiredFoundCount >= Math.ceil(requiredTotal * 0.6)) {
            strengths.push({ text: `Resume demonstrates ${requiredFoundCount} of ${requiredTotal} required job competencies.`, category: 'keywords' });
        }
        if (verbsFound.length >= 3) {
            strengths.push({ text: `Action-driven phrasing detected across experience points (e.g., "${verbsFound.slice(0, 3).join('", "')}").`, category: 'keywords' });
        }
        if (requiredTotal > 0 && requiredFoundCount < Math.ceil(requiredTotal * 0.35)) {
            improvements.push({ text: `Only ${requiredFoundCount} of ${requiredTotal} required skills were found in your text. Review the requirements and ensure your relevant qualifications are not omitted.`, category: 'keywords' });
        }
        if (softFoundCount === 0 && jdKeywords.some(k => k.category === CATEGORY_LABELS.softSkills)) {
            improvements.push({ text: 'The job description emphasizes soft skills (e.g., collaboration, communication) that aren\'t evident in your resume text. Consider whether your bullet points can naturally reflect this kind of work.', category: 'keywords' });
        }
        if (verbsFound.length < 2) {
            improvements.push({ text: 'Bullet points rely on passive phrases. Begin accomplishment lines with active impact verbs.', category: 'content', suggestion: 'Instead of "Responsible for creating APIs" → "Engineered scalable RESTful APIs..."' });
        }

        keywordsScore = clamp(keywordsScore, 20, 97);
        scores.keywords = keywordsScore;

        // 3. Format Score
        let formatScore = 50;
        if (wordCount >= 150 && wordCount <= 700) {
            formatScore += 20;
            strengths.push({ text: `Resume word count is well proportioned (${wordCount} words).`, category: 'format' });
        } else if (wordCount < 150) {
            improvements.push({ text: `Resume is quite short (${wordCount} words). This matters because a thin resume gives ATS and recruiters little to match against. Aim for roughly 250–600 words.`, category: 'format' });
        } else {
            improvements.push({ text: `Resume is lengthy (${wordCount} words). Consider condensing older or non-relevant sections to keep recruiter focus high.`, category: 'format', suggestion: 'Focus on recent impactful experience and trim older bullet points.' });
        }

        const hasBullets = content.includes('•') || content.includes('- ') || content.includes('* ') || content.includes('·');
        if (hasBullets) {
            formatScore += 12;
            strengths.push({ text: 'Uses structured bullet lists, enhancing fast scanning for hiring managers.', category: 'format' });
        } else {
            improvements.push({ text: 'Content appears in dense paragraphs. Bulleted lists are significantly easier for recruiters to review.', category: 'format', suggestion: '• Break large paragraphs into 1–2 line bullet points.' });
        }

        if (lineCount > 12) formatScore += 6;

        const hasLinks = lower.includes('linkedin') || lower.includes('github') || lower.includes('portfolio') || lower.includes('.com') || lower.includes('.dev');
        if (hasLinks) {
            formatScore += 4;
            strengths.push({ text: 'Includes professional portfolio or profile reference (e.g. GitHub/LinkedIn).', category: 'format' });
        } else {
            improvements.push({ text: 'No LinkedIn or GitHub profile link was found. (Optional enhancement)', category: 'format' });
        }

        formatScore = clamp(formatScore, 20, 96);
        scores.format = formatScore;

        // 4. Content Score
        let contentScore = 45;
        const hasNumbers = content.match(/\d+%|\$[\d,.]+|\d+\+|\d+ (years?|months?|projects?|clients?|users?|team|people|members?|engineers?|ms|seconds?)/gi);
        if (hasNumbers && hasNumbers.length >= 2) {
            contentScore += 25;
            strengths.push({ text: `Includes concrete quantitative metrics/results (${hasNumbers.length} detected).`, category: 'content', evidence: hasNumbers.slice(0, 3).join(', ') });
        } else if (hasNumbers && hasNumbers.length === 1) {
            contentScore += 12;
            improvements.push({ text: 'A metric was detected, but adding more quantifiable results strengthens candidate credibility.', category: 'content', suggestion: 'e.g., "Improved API response time by 25%"' });
        } else {
            improvements.push({ text: 'No quantifiable outcomes (percentages, speedups, scale metrics) detected. Concrete numbers validate the scope of your work.', category: 'content', suggestion: 'Quantify impact where possible (e.g., "Reduced latency by 20%", "Supported 10k+ active users").' });
        }

        if (verbsFound.length >= 3) contentScore += 10;
        if (lower.includes('improved') || lower.includes('optimized') || lower.includes('built') || lower.includes('deployed') || lower.includes('reduced')) {
            contentScore += 8;
        }

        const vagueTerms = ['responsible for', 'duties included', 'helped with', 'assisted in', 'participated in', 'was involved'];
        const vagueFound = vagueTerms.filter(v => lower.includes(v));
        if (vagueFound.length > 0) {
            contentScore -= vagueFound.length * 3;
            improvements.push({ text: `Found passive phrasing: "${vagueFound.join('", "')}". Use direct action verbs instead.`, category: 'content', suggestion: `Replace "${vagueFound[0]}" with "Architected", "Engineered", or "Spearheaded".` });
        }

        contentScore = clamp(contentScore, 20, 95);
        scores.content = contentScore;

        // 5. Grammar & Tone Score
        let grammarScore = 60;
        const doubleSpaces = (content.match(/  +/g) || []).length;
        if (doubleSpaces > 6) {
            grammarScore -= 6;
            improvements.push({ text: 'Inconsistent spacing detected (multiple double spaces across lines).', category: 'grammar' });
        } else {
            grammarScore += 8;
        }

        if (!lower.includes('i am') && !lower.includes("i'm") && !lower.includes('my ') && !lower.includes('i had') && !lower.includes('i was')) {
            grammarScore += 12;
            strengths.push({ text: 'Maintains a professional third-person tone throughout, with no first-person pronouns detected.', category: 'grammar' });
        } else {
            improvements.push({ text: 'First-person pronouns detected (I, my, me). Modern resumes should utilize concise, implied third-person phrases.', category: 'grammar', suggestion: 'Instead of: "I developed APIs" → "Developed and maintained APIs"' });
        }

        grammarScore = clamp(grammarScore, 25, 98);
        scores.grammar = grammarScore;

        // Explicit Keyword-Based Strengths with sections and evidence snippets
        foundKeywords.filter(k => k.required !== false).slice(0, 5).forEach(k => {
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
            { title: 'Tailor for Each Role', desc: 'Ensure the required qualifications from the JD are prominently visible in your skills and summary.' },
            { title: 'Action + Impact Format', desc: 'Structure bullet points with action verbs followed by quantifiable achievements.' },
            { title: 'Clean Parseable Layout', desc: 'Use plain text headers (Experience, Education, Skills) to optimize parsing compatibility.' },
            { title: 'Be Precise, Not Generic', desc: 'Mention exact frameworks, versions, and deployment tools you have hands-on experience with.' },
        ];
        if (requiredTotal > 0 && requiredFoundCount < requiredTotal) {
            tips.push({ title: 'Review Required Gaps', desc: 'Check missing required terms. Add only those you genuinely possess experience in.' });
        }
        if (!hasNumbers || hasNumbers.length < 2) {
            tips.push({ title: 'Quantify Achievements', desc: 'Include percentages, dollar amounts, or team sizes to demonstrate measurable impact.' });
        }

        const overall = Math.round(
            scores.ats * 0.25 + scores.keywords * 0.25 + scores.format * 0.15 + scores.content * 0.20 + scores.grammar * 0.15
        );

        let verdict, summary;
        if (overall >= 75) { verdict = 'Strong Match! 🌟'; summary = 'Well-aligned with the target profile and cleanly structured.'; }
        else if (overall >= 60) { verdict = 'Good Potential 💪'; summary = 'Solid foundation with clear opportunities for enhancement.'; }
        else if (overall >= 50) { verdict = 'Needs Polish 📈'; summary = 'Several key qualifications or structural areas need updating.'; }
        else { verdict = 'Needs Significant Work 🔧'; summary = 'Review core requirements and ensure key background details are clearly represented.'; }

        return {
            overall, scores, verdict, summary,
            strengths: strengths.slice(0, 8),
            improvements: improvements.slice(0, 10),
            foundKeywords: foundKeywords.slice(0, 25),
            missingKeywords: missingKeywords.slice(0, 25),
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
        bulkResults.sort((a, b) => b.overall - a.overall);

        rankingSection.style.display = 'block';
        rankingSection.scrollIntoView({ behavior: 'smooth' });

        const totalEl = document.getElementById('total-candidates');
        if (totalEl) totalEl.textContent = bulkResults.length;
        const avgAts = Math.round(bulkResults.reduce((s, r) => s + r.scores.ats, 0) / bulkResults.length);
        const avgAtsEl = document.getElementById('avg-ats');
        if (avgAtsEl) avgAtsEl.textContent = avgAts + '%';
        const topScoreEl = document.getElementById('top-score');
        if (topScoreEl) topScoreEl.textContent = bulkResults[0]?.overall || 0;
        const belowEl = document.getElementById('below-threshold');
        if (belowEl) belowEl.textContent = bulkResults.filter(r => r.overall < (minScore || 50)).length;

        renderRankingTable();
        setupRankingControls();
    }

    function renderRankingTable() {
        const tbody = document.getElementById('rank-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        let filtered = [...bulkResults];

        if (activeFilter === 'pass') filtered = filtered.filter(r => r.scores.ats >= 70);
        else if (activeFilter === 'review') filtered = filtered.filter(r => r.scores.ats >= 50 && r.scores.ats < 70);
        else if (activeFilter === 'fail') filtered = filtered.filter(r => r.scores.ats < 50);

        filtered.sort((a, b) => {
            const valA = sortField === 'overall' ? a.overall : (a.scores[sortField] ?? a.overall);
            const valB = sortField === 'overall' ? b.overall : (b.scores[sortField] ?? b.overall);
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
        const sortSelect = document.getElementById('sort-by');
        if (sortSelect) {
            sortSelect.onchange = () => { sortField = sortSelect.value; renderRankingTable(); };
        }

        const sortDirBtn = document.getElementById('sort-dir-btn');
        if (sortDirBtn) {
            sortDirBtn.onclick = () => { sortAsc = !sortAsc; sortDirBtn.style.transform = sortAsc ? 'scaleY(-1)' : ''; renderRankingTable(); };
        }

        document.querySelectorAll('.filter-chip').forEach(chip => {
            chip.onclick = () => {
                document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                activeFilter = chip.dataset.filter;
                renderRankingTable();
            };
        });

        const exportBtn = document.getElementById('export-btn');
        if (exportBtn) exportBtn.onclick = exportCSV;

        const bulkAgainBtn = document.getElementById('bulk-again-btn');
        if (bulkAgainBtn) {
            bulkAgainBtn.onclick = () => {
                rankingSection.style.display = 'none';
                bulkUploadSection.style.display = 'block';
                bulkFiles = [];
                bulkResults = [];
                renderQueue();
                bulkUploadSection.scrollIntoView({ behavior: 'smooth' });
            };
        }
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

    if (modalClose) modalClose.addEventListener('click', () => modal.style.display = 'none');
    if (modal) {
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });
    }
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modal) modal.style.display = 'none'; });

    document.querySelectorAll('.modal-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.modal-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.modal-panel').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            const targetPanel = document.getElementById(`mpanel-${tab.dataset.mtab}`);
            if (targetPanel) targetPanel.classList.add('active');
        });
    });

    function keywordTagHtml(k, isMissing) {
        const badge = k.required === true ? 'Required' : k.required === false ? 'Preferred' : '';
        const titleParts = [k.category, badge].filter(Boolean);
        const suffix = isMissing && k.required === false ? ' <small style="opacity:0.7;">(preferred)</small>' : '';
        return `<span class="keyword-tag" title="${titleParts.join(' • ')}">${k.term}${suffix}</span>`;
    }

    function openDetailModal(idx) {
        const r = bulkResults[idx];
        const rank = bulkResults.slice().sort((a, b) => b.overall - a.overall).indexOf(r) + 1;

        const rankEl = document.getElementById('modal-rank');
        if (rankEl) rankEl.textContent = `#${rank}`;
        const nameEl = document.getElementById('modal-candidate-name');
        if (nameEl) nameEl.textContent = r.fileName.replace(/\.(pdf|txt|doc|docx)$/i, '').replace(/[-_]/g, ' ');

        // Score ring
        const circumference = 2 * Math.PI * 52;
        const ring = document.getElementById('modal-ring-progress');
        const scoreNum = document.getElementById('modal-overall-score');
        if (scoreNum) scoreNum.textContent = r.overall;
        if (ring) {
            setTimeout(() => {
                ring.style.strokeDasharray = `${(r.overall / 100) * circumference} ${circumference}`;
            }, 100);
        }

        // Category scores
        const catScores = document.getElementById('modal-cat-scores');
        if (catScores) {
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
        }

        // Improvements
        const impList = document.getElementById('modal-improvements');
        if (impList) {
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
        }

        // Strengths
        const strList = document.getElementById('modal-strengths');
        if (strList) {
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
        }

        // Keywords
        const foundKw = document.getElementById('modal-found-kw');
        if (foundKw) {
            foundKw.innerHTML = r.foundKeywords.map(k => keywordTagHtml(k, false)).join('');
            if (r.foundKeywords.length === 0) foundKw.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;">No specific keywords detected.</p>';
        }

        const missingKw = document.getElementById('modal-missing-kw');
        if (missingKw) {
            missingKw.innerHTML = r.missingKeywords.map(k => keywordTagHtml(k, true)).join('');
            if (r.missingKeywords.length === 0) missingKw.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;">All identified key requirements are covered!</p>';
        }

        // ATS Details
        const atsDetails = document.getElementById('modal-ats-details');
        if (atsDetails) {
            const noteHtml = `
                <div class="ats-detail-item" style="background: rgba(129, 140, 248, 0.08); border-left: 3px solid #818cf8; padding: 10px 12px; margin-bottom: 12px; border-radius: 4px;">
                    <div class="ats-check pass">ℹ️</div>
                    <span class="ats-detail-text">This is an <strong>ATS Compatibility Estimate</strong> based on structure and keyword alignment signals in your document — not an official score from an employer's proprietary ATS.</span>
                </div>`;
            atsDetails.innerHTML = noteHtml + r.atsChecks.map(c => `
                <div class="ats-detail-item">
                    <div class="ats-check ${c.pass ? 'pass' : 'fail'}">${c.pass ? '✓' : '✕'}</div>
                    <span class="ats-detail-text">${c.text}</span>
                </div>
            `).join('');
        }

        // Reset to first tab
        document.querySelectorAll('.modal-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.modal-panel').forEach(p => p.classList.remove('active'));
        const firstTab = document.querySelector('.modal-tab');
        if (firstTab) firstTab.classList.add('active');
        const firstPanel = document.getElementById('mpanel-improvements');
        if (firstPanel) firstPanel.classList.add('active');

        if (modal) modal.style.display = 'flex';
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
            const targetPanel = document.getElementById(`panel-${tab.dataset.tab}`);
            if (targetPanel) targetPanel.classList.add('active');
        });
    });

    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const filePreview = document.getElementById('file-preview');
    const fileNameEl = document.getElementById('file-name');
    const fileSizeEl = document.getElementById('file-size');
    const fileRemoveBtn = document.getElementById('file-remove');
    let singleFile = null;

    if (dropZone && fileInput) {
        dropZone.addEventListener('click', () => fileInput.click());
        dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
        dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
        dropZone.addEventListener('drop', e => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
            if (e.dataTransfer.files.length) handleSingleFile(e.dataTransfer.files[0]);
        });
        fileInput.addEventListener('change', () => {
            if (fileInput.files.length) handleSingleFile(fileInput.files[0]);
        });
    }

    function handleSingleFile(file) {
        singleFile = file;
        if (fileNameEl) fileNameEl.textContent = file.name;
        if (fileSizeEl) fileSizeEl.textContent = formatSize(file.size);
        if (dropZone) dropZone.style.display = 'none';
        if (filePreview) filePreview.style.display = 'block';
    }

    if (fileRemoveBtn) {
        fileRemoveBtn.addEventListener('click', () => {
            singleFile = null;
            if (fileInput) fileInput.value = '';
            if (dropZone) dropZone.style.display = 'block';
            if (filePreview) filePreview.style.display = 'none';
        });
    }

    const singleAnalyzeBtn = document.getElementById('single-analyze-btn');
    const singleUpload = document.getElementById('single-upload');
    const singleLoading = document.getElementById('single-loading');
    const singleResults = document.getElementById('single-results');
    const singleProgressBar = document.getElementById('single-progress-bar');
    const singleLoaderStatus = document.getElementById('single-loader-status');
    const resumeText = document.getElementById('resume-text');

    if (singleAnalyzeBtn) {
        singleAnalyzeBtn.addEventListener('click', async () => {
            const activeTabEl = document.querySelector('#single-upload .upload-tab.active');
            const activeTab = activeTabEl ? activeTabEl.dataset.tab : 'text';
            let content = '';

            if (activeTab === 'text') {
                content = resumeText ? resumeText.value.trim() : '';
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

            const jdText = document.getElementById('jd-input') ? document.getElementById('jd-input').value.trim() : '';

            if (singleUpload) singleUpload.style.display = 'none';
            if (singleLoading) {
                singleLoading.style.display = 'block';
                singleLoading.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }

            const stages = [
                { text: 'Parsing document structure...', progress: 15 },
                { text: 'Extracting keywords & skills...', progress: 35 },
                { text: 'Analyzing ATS compatibility...', progress: 55 },
                { text: 'Evaluating content quality...', progress: 75 },
                { text: 'Generating recommendations...', progress: 90 },
                { text: 'Finalizing report...', progress: 100 },
            ];

            if (singleProgressBar) singleProgressBar.style.width = '0%';
            let idx = 0;
            const advance = () => {
                if (idx < stages.length) {
                    if (singleLoaderStatus) singleLoaderStatus.textContent = stages[idx].text;
                    if (singleProgressBar) singleProgressBar.style.width = stages[idx].progress + '%';
                    idx++;
                    setTimeout(advance, 350 + Math.random() * 200);
                } else {
                    setTimeout(() => showSingleResults(content, jdText), 300);
                }
            };
            setTimeout(advance, 150);
        });
    }

    function showSingleResults(content, jdText = '') {
        const r = analyzeResume(content, jdText);

        if (singleLoading) singleLoading.style.display = 'none';
        if (singleResults) {
            singleResults.style.display = 'block';
            singleResults.scrollIntoView({ behavior: 'smooth' });
        }

        const circumference = 2 * Math.PI * 52;
        const ring = document.getElementById('single-ring-progress');
        const scoreEl = document.getElementById('s-overall-score');
        if (scoreEl) animateNumber(scoreEl, 0, r.overall, 1200);
        if (ring) {
            setTimeout(() => {
                ring.style.strokeDasharray = `${(r.overall / 100) * circumference} ${circumference}`;
            }, 100);
        }

        const verdictEl = document.getElementById('s-score-verdict');
        if (verdictEl) verdictEl.textContent = r.verdict;
        const summaryEl = document.getElementById('s-score-summary');
        if (summaryEl) summaryEl.textContent = r.summary;

        const catData = [
            { val: 's-cat-ats-val', bar: 's-cat-ats-bar', score: r.scores.ats },
            { val: 's-cat-kw-val', bar: 's-cat-kw-bar', score: r.scores.keywords },
            { val: 's-cat-fmt-val', bar: 's-cat-fmt-bar', score: r.scores.format },
            { val: 's-cat-cnt-val', bar: 's-cat-cnt-bar', score: r.scores.content },
            { val: 's-cat-gram-val', bar: 's-cat-gram-bar', score: r.scores.grammar },
        ];
        catData.forEach((c, i) => {
            setTimeout(() => {
                const vEl = document.getElementById(c.val);
                const bEl = document.getElementById(c.bar);
                if (vEl) vEl.textContent = c.score + '%';
                if (bEl) bEl.style.width = c.score + '%';
            }, 150 + i * 120);
        });

        const sList = document.getElementById('s-strengths-list');
        if (sList) {
            sList.innerHTML = r.strengths.length
                ? r.strengths.map(s => `<li><span class="finding-icon">✅</span><span>${s.text}${s.evidence ? '<br><em style="color:var(--text-muted);font-size:0.8rem;">📌 "' + s.evidence + '"' + (s.section ? ' — ' + s.section + ' section' : '') + '</em>' : ''}</span></li>`).join('')
                : '<li><span class="finding-icon">ℹ️</span><span>No strong, evidence-backed highlights were identified from the current resume/JD comparison.</span></li>';
        }

        const iList = document.getElementById('s-improvements-list');
        if (iList) {
            iList.innerHTML = r.improvements.length
                ? r.improvements.map(imp => `<li><span class="finding-icon">⚠️</span><span>${imp.text}${imp.suggestion ? '<br><em style="color:var(--accent-emerald);font-size:0.8rem;">💡 ' + imp.suggestion.split('\n')[0] + '</em>' : ''}</span></li>`).join('')
                : '<li><span class="finding-icon">✅</span><span>No significant issues detected relative to this job description.</span></li>';
        }

        const fKw = document.getElementById('s-found-kw');
        if (fKw) {
            fKw.innerHTML = r.foundKeywords.map(k => keywordTagHtml(k, false)).join('') || '<p style="color:var(--text-muted);font-size:0.85rem;">No specific keywords detected.</p>';
        }

        const mKw = document.getElementById('s-missing-kw');
        if (mKw) {
            mKw.innerHTML = r.missingKeywords.map(k => keywordTagHtml(k, true)).join('');
            if (r.missingKeywords.length === 0) mKw.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;">All identified key requirements are covered!</p>';
        }

        const tipsGrid = document.getElementById('s-tips-grid');
        if (tipsGrid) {
            tipsGrid.innerHTML = r.tips.map((t, i) => `
                <div class="tip-card fade-in visible">
                    <div class="tip-number">${String(i + 1).padStart(2, '0')}</div>
                    <div class="tip-content"><h4>${t.title}</h4><p>${t.desc}</p></div>
                </div>
            `).join('');
        }
    }

    const singleAgainBtn = document.getElementById('single-again-btn');
    if (singleAgainBtn) {
        singleAgainBtn.addEventListener('click', () => {
            if (singleResults) singleResults.style.display = 'none';
            if (singleUpload) singleUpload.style.display = 'block';
            singleFile = null;
            if (fileInput) fileInput.value = '';
            if (dropZone) dropZone.style.display = 'block';
            if (filePreview) filePreview.style.display = 'none';
            if (resumeText) resumeText.value = '';
            if (singleUpload) singleUpload.scrollIntoView({ behavior: 'smooth' });
        });
    }

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