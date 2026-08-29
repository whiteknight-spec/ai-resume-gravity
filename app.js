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

    // ===========================
    // ANALYSIS ENGINE
    // ===========================
    function analyzeResume(content, jobDescription = '') {
        const lower = content.toLowerCase();
        const jdLower = jobDescription.toLowerCase();
        const wordCount = content.split(/\s+/).length;
        const lineCount = content.split('\n').length;

        const scores = {};
        const strengths = [];
        const improvements = [];
        const foundKeywords = [];
        const missingKeywords = [];
        const atsChecks = [];

        // Extract JD keywords
        const jdKeywords = extractJDKeywords(jdLower);

        // -- ATS Score --
        let atsScore = 55;
        const sectionHeaders = ['experience', 'education', 'skills', 'summary', 'objective', 'projects', 'certifications', 'awards', 'work history', 'professional experience', 'qualifications'];
        const foundSections = sectionHeaders.filter(k => lower.includes(k));

        if (foundSections.length >= 4) {
            atsScore += 20;
            atsChecks.push({ pass: true, text: `Clear section headings found: ${foundSections.join(', ')}` });
            strengths.push({ text: 'Well-structured with clear section headings', category: 'ats' });
        } else if (foundSections.length >= 2) {
            atsScore += 10;
            atsChecks.push({ pass: true, text: `Some section headings found: ${foundSections.join(', ')}` });
        } else {
            atsChecks.push({ pass: false, text: 'Missing standard section headings (Experience, Education, Skills)' });
            improvements.push({ text: 'Add clear section headings like Experience, Education, Skills, Summary', category: 'ats', suggestion: 'PROFESSIONAL EXPERIENCE\n• [Job Title] at [Company] (Year-Year)\n\nEDUCATION\n• [Degree] — [University] (Year)' });
        }

        const hasContact = lower.includes('@') || lower.match(/\(\d{3}\)|\d{3}[-.]?\d{3}[-.]?\d{4}/);
        if (hasContact) { atsScore += 8; atsChecks.push({ pass: true, text: 'Contact information detected (email/phone)' }); }
        else { atsChecks.push({ pass: false, text: 'No contact information detected' }); improvements.push({ text: 'Add your email address and phone number at the top', category: 'ats' }); }

        const hasName = content.split('\n')[0]?.trim().length > 2 && content.split('\n')[0]?.trim().length < 50;
        if (hasName) { atsChecks.push({ pass: true, text: 'Name appears at top of resume' }); atsScore += 5; }

        if (!lower.includes('image') && !lower.includes('photo') && !lower.includes('.jpg') && !lower.includes('.png')) {
            atsChecks.push({ pass: true, text: 'No images detected (ATS-friendly)' }); atsScore += 3;
        } else {
            atsChecks.push({ pass: false, text: 'Images detected — ATS systems cannot parse images' });
            improvements.push({ text: 'Remove images and photos — ATS systems cannot read them', category: 'ats' });
        }

        // JD matching for ATS
        if (jdKeywords.length > 0) {
            const jdMatched = jdKeywords.filter(k => lower.includes(k));
            const jdMatchPercent = Math.round((jdMatched.length / jdKeywords.length) * 100);
            atsScore = Math.round(atsScore * 0.6 + jdMatchPercent * 0.4);
            atsChecks.push({ pass: jdMatchPercent >= 50, text: `Job description keyword match: ${jdMatchPercent}% (${jdMatched.length}/${jdKeywords.length} keywords)` });
            if (jdMatchPercent < 50) {
                improvements.push({ text: `Only ${jdMatchPercent}% of job description keywords found. Tailor your resume to include more relevant terms.`, category: 'ats' });
            }
        }

        atsScore = clamp(atsScore, 20, 98);
        scores.ats = atsScore;

        // -- Keywords Score --
        let keywordsScore = 45;
        const techKw = ['javascript', 'python', 'java', 'react', 'node', 'nodejs', 'sql', 'aws', 'docker', 'kubernetes', 'git', 'agile', 'machine learning', 'data analysis', 'api', 'cloud', 'devops', 'html', 'css', 'typescript', 'mongodb', 'postgresql', 'redis', 'graphql', 'rest', 'microservices', 'ci/cd', 'terraform', 'linux', 'scrum'];
        const softKw = ['leadership', 'team', 'communication', 'problem-solving', 'collaboration', 'management', 'strategic', 'initiative', 'mentor', 'stakeholder', 'cross-functional'];
        const verbs = ['led', 'developed', 'implemented', 'managed', 'designed', 'created', 'improved', 'increased', 'reduced', 'delivered', 'built', 'launched', 'optimized', 'achieved', 'spearheaded', 'architected', 'mentored', 'streamlined', 'orchestrated', 'established'];

        const allSearchKw = jdKeywords.length > 0 ? [...new Set([...jdKeywords, ...techKw.slice(0, 10)])] : techKw;
        const techFound = allSearchKw.filter(k => lower.includes(k));
        const softFound = softKw.filter(k => lower.includes(k));
        const verbsFound = verbs.filter(k => lower.includes(k));

        techFound.forEach(k => foundKeywords.push(k));
        softFound.forEach(k => foundKeywords.push(k));

        keywordsScore += techFound.length * 2.5 + softFound.length * 2 + verbsFound.length * 1.5;

        const allMissing = allSearchKw.filter(k => !lower.includes(k));
        const softMissing = softKw.filter(k => !lower.includes(k));
        allMissing.slice(0, 8).forEach(k => missingKeywords.push(k));
        softMissing.slice(0, 4).forEach(k => missingKeywords.push(k));

        if (techFound.length >= 5) strengths.push({ text: `Strong technical keyword coverage (${techFound.length} found)`, category: 'keywords' });
        if (verbsFound.length >= 4) strengths.push({ text: 'Excellent use of action verbs throughout', category: 'keywords' });
        if (techFound.length < 3) improvements.push({ text: 'Add more relevant technical skills and tools', category: 'keywords', suggestion: `Consider adding: ${allMissing.slice(0, 5).join(', ')}` });
        if (softFound.length === 0) improvements.push({ text: 'Include soft skills like leadership, communication, collaboration', category: 'keywords' });
        if (verbsFound.length < 3) improvements.push({ text: 'Use stronger action verbs to begin bullet points', category: 'content', suggestion: 'Replace weak verbs: "Responsible for..." → "Led...", "Helped with..." → "Delivered..."' });

        keywordsScore = clamp(keywordsScore, 20, 97);
        scores.keywords = keywordsScore;

        // -- Format Score --
        let formatScore = 50;
        if (wordCount >= 150 && wordCount <= 700) { formatScore += 18; strengths.push({ text: `Resume length is ideal (${wordCount} words)`, category: 'format' }); }
        else if (wordCount < 150) { improvements.push({ text: `Resume is too short (${wordCount} words). Aim for 300-600 words.`, category: 'format' }); }
        else if (wordCount > 700) { improvements.push({ text: `Resume may be too long (${wordCount} words). Condense to 1-2 pages.`, category: 'format', suggestion: 'Remove older or less relevant positions. Focus on the last 10-15 years.' }); }

        const hasBullets = content.includes('•') || content.includes('- ') || content.includes('* ');
        if (hasBullets) { formatScore += 12; strengths.push({ text: 'Uses bullet points for readability', category: 'format' }); }
        else { improvements.push({ text: 'Use bullet points instead of paragraphs for better readability', category: 'format', suggestion: '• Bullet point format is preferred by 78% of recruiters\n• Each bullet should be 1-2 lines max\n• Start with an action verb' }); }

        if (lineCount > 15) formatScore += 8;
        if (lower.includes('linkedin') || lower.includes('github') || lower.includes('portfolio')) {
            formatScore += 8; strengths.push({ text: 'Includes professional profile links (LinkedIn/GitHub)', category: 'format' });
        } else {
            improvements.push({ text: 'Add LinkedIn and/or GitHub profile links', category: 'format' });
        }

        formatScore = clamp(formatScore, 20, 96);
        scores.format = formatScore;

        // -- Content Score --
        let contentScore = 45;
        const hasNumbers = content.match(/\d+%|\$[\d,.]+|\d+\+|\d+ (years?|months?|projects?|clients?|users?|team|people|members?|engineers?)/gi);
        if (hasNumbers && hasNumbers.length >= 3) {
            contentScore += 25;
            strengths.push({ text: `Excellent quantified achievements (${hasNumbers.length} metrics found)`, category: 'content' });
        } else if (hasNumbers && hasNumbers.length > 0) {
            contentScore += 12;
            improvements.push({ text: 'Add more quantified achievements — numbers make your impact concrete', category: 'content', suggestion: 'Instead of: "Improved system performance"\nWrite: "Improved system performance by 40%, reducing page load time from 3.2s to 1.9s"' });
        } else {
            improvements.push({ text: 'Quantify your achievements with numbers, percentages, and metrics', category: 'content', suggestion: '• "Managed a team of 12 engineers across 3 time zones"\n• "Increased revenue by 25% ($2.4M) through feature optimization"\n• "Reduced deployment time by 60% using CI/CD automation"' });
        }

        if (verbsFound.length >= 3) contentScore += 10;

        if (lower.includes('achieved') || lower.includes('accomplished') || lower.includes('exceeded') || lower.includes('award')) {
            contentScore += 8;
            strengths.push({ text: 'Highlights achievements and accomplishments', category: 'content' });
        }

        // Check for vague phrases
        const vagueTerms = ['responsible for', 'duties included', 'helped with', 'assisted in', 'participated in', 'was involved'];
        const vagueFound = vagueTerms.filter(v => lower.includes(v));
        if (vagueFound.length > 0) {
            contentScore -= vagueFound.length * 3;
            improvements.push({ text: `Remove vague phrases: "${vagueFound.join('", "')}"`, category: 'content', suggestion: `Replace "${vagueFound[0]}" with a specific action verb like "Led", "Developed", "Implemented"` });
        }

        contentScore = clamp(contentScore, 20, 95);
        scores.content = contentScore;

        // -- Grammar Score --
        let grammarScore = 60;
        const doubleSpaces = (content.match(/  +/g) || []).length;
        if (doubleSpaces > 5) {
            grammarScore -= 8;
            improvements.push({ text: 'Fix inconsistent spacing — multiple double spaces detected', category: 'grammar' });
        } else { grammarScore += 8; }

        if (!lower.includes('i am') && !lower.includes("i'm") && !lower.includes('my ') && !lower.includes('i ')) {
            grammarScore += 12;
            strengths.push({ text: 'Professional third-person tone maintained', category: 'grammar' });
        } else {
            improvements.push({ text: 'Avoid first-person pronouns (I, my, me) — use third-person professional tone', category: 'grammar', suggestion: 'Instead of: "I managed a team of 5"\nWrite: "Managed a team of 5 engineers"' });
        }

        // Tense consistency (simplified check)
        const pastTense = (content.match(/\b(led|developed|managed|created|built|achieved|designed|implemented)\b/gi) || []).length;
        const presentTense = (content.match(/\b(lead|develop|manage|create|build|achieve|design|implement)\b/gi) || []).length;
        if (pastTense > 0 && presentTense > 0 && Math.abs(pastTense - presentTense) < 2) {
            improvements.push({ text: 'Inconsistent tense usage — use past tense for previous roles and present for current', category: 'grammar' });
        } else { grammarScore += 5; }

        grammarScore = clamp(grammarScore, 25, 98);
        scores.grammar = grammarScore;

        // Additional checks
        if (lower.includes('certif') || lower.includes('certified')) strengths.push({ text: 'Includes relevant certifications', category: 'keywords' });
        if (lower.includes('award') || lower.includes('recognition') || lower.includes('honor')) strengths.push({ text: 'Highlights awards and recognition', category: 'content' });

        // Ensure minimums
        if (strengths.length < 2) {
            strengths.push({ text: 'Resume submitted for analysis — great first step!', category: 'format' });
        }
        if (improvements.length < 2) {
            improvements.push({ text: 'Tailor your resume for each specific job application', category: 'content' });
            improvements.push({ text: 'Keep your resume updated with latest accomplishments', category: 'format' });
        }

        // Tips
        const tips = [
            { title: 'Tailor for Each Job', desc: 'Customize your resume by mirroring keywords from the job description.' },
            { title: 'Use the STAR Method', desc: 'Structure achievements as Situation, Task, Action, Result.' },
            { title: 'Optimize for ATS', desc: 'Use standard headings and avoid tables/images that ATS can\'t parse.' },
            { title: 'Keep It Concise', desc: 'Hiring managers spend ~7 seconds scanning. Lead with strongest points.' },
        ];
        if (techFound.length < 5) tips.push({ title: 'Add Skills Section', desc: 'Create a dedicated skills section with relevant technical and soft skills.' });
        if (!hasNumbers || hasNumbers.length < 3) tips.push({ title: 'Quantify Everything', desc: '"Managed a team of 12" is stronger than "Managed a team".' });

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
            foundKeywords: [...new Set(foundKeywords)].slice(0, 15),
            missingKeywords: [...new Set(missingKeywords)].slice(0, 12),
            tips: tips.slice(0, 6),
            atsChecks,
            wordCount
        };
    }

    function extractJDKeywords(jdText) {
        if (!jdText) return [];
        // Extract meaningful keywords from job description
        const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'this', 'that', 'these', 'those', 'i', 'you', 'we', 'they', 'it', 'as', 'if', 'not', 'no', 'so', 'up', 'out', 'about', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between', 'under', 'over', 'own', 'same', 'than', 'too', 'very', 'just', 'also', 'must', 'our', 'your', 'their', 'its', 'who', 'which', 'what', 'when', 'where', 'how', 'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'only', 'new', 'work', 'able', 'well', 'etc', 'including', 'strong', 'required', 'preferred', 'requirements', 'qualifications', 'responsibilities', 'description', 'role', 'position', 'job', 'company', 'team', 'will', 'years', 'year', 'plus', 'minimum', 'experience', 'knowledge', 'understanding', 'ability', 'looking', 'seeking', 'join', 'based', 'related', 'working']);

        const words = jdText.match(/[a-z][a-z+#/.]+/g) || [];
        const keywords = words.filter(w => w.length > 2 && !stopWords.has(w));

        // Also extract multi-word phrases
        const phrases = jdText.match(/[a-z]+[\s-][a-z]+(?:[\s-][a-z]+)?/g) || [];
        const meaningfulPhrases = phrases.filter(p => {
            const parts = p.split(/[\s-]+/);
            return parts.length >= 2 && parts.some(pt => !stopWords.has(pt)) && p.length > 5;
        });

        return [...new Set([...keywords, ...meaningfulPhrases])].slice(0, 30);
    }

    function clamp(val, min, max) { return Math.min(max, Math.max(min, val)); }

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
        impList.innerHTML = r.improvements.map(imp => `
            <div class="improvement-item">
                <div class="imp-header">
                    <span class="imp-icon">⚠️</span>
                    <span class="imp-category ${imp.category}">${imp.category}</span>
                </div>
                <div class="imp-text">${imp.text}</div>
                ${imp.suggestion ? `<div class="imp-suggestion">💡 Suggestion:\n${imp.suggestion}</div>` : ''}
            </div>
        `).join('');

        // Strengths
        const strList = document.getElementById('modal-strengths');
        strList.innerHTML = r.strengths.map(s => `
            <div class="improvement-item">
                <div class="imp-header">
                    <span class="imp-icon">✅</span>
                    <span class="imp-category ${s.category}">${s.category}</span>
                </div>
                <div class="imp-text">${s.text}</div>
            </div>
        `).join('');

        // Keywords
        const foundKw = document.getElementById('modal-found-kw');
        foundKw.innerHTML = r.foundKeywords.map(k => `<span class="keyword-tag">${k}</span>`).join('');
        if (r.foundKeywords.length === 0) foundKw.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;">No specific keywords detected.</p>';

        const missingKw = document.getElementById('modal-missing-kw');
        missingKw.innerHTML = r.missingKeywords.map(k => `<span class="keyword-tag">${k}</span>`).join('');
        if (r.missingKeywords.length === 0) missingKw.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;">All key keywords covered!</p>';

        // ATS Details
        const atsDetails = document.getElementById('modal-ats-details');
        atsDetails.innerHTML = r.atsChecks.map(c => `
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
        sList.innerHTML = r.strengths.map(s => `<li><span class="finding-icon">✅</span><span>${s.text}</span></li>`).join('');

        // Improvements
        const iList = document.getElementById('s-improvements-list');
        iList.innerHTML = r.improvements.map(imp => `<li><span class="finding-icon">⚠️</span><span>${imp.text}${imp.suggestion ? '<br><em style="color:var(--accent-emerald);font-size:0.8rem;">💡 ' + imp.suggestion.split('\n')[0] + '</em>' : ''}</span></li>`).join('');

        // Keywords
        const fKw = document.getElementById('s-found-kw');
        fKw.innerHTML = r.foundKeywords.map(k => `<span class="keyword-tag">${k}</span>`).join('') || '<p style="color:var(--text-muted);font-size:0.85rem;">No specific keywords detected.</p>';

        const mKw = document.getElementById('s-missing-kw');
        mKw.innerHTML = r.missingKeywords.map(k => `<span class="keyword-tag">${k}</span>`).join('');

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
