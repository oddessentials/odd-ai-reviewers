/**
 * Docs Viewer - AI Reviewers Documentation Tool
 * A secure, GitHub Pages-compatible viewer for project documentation.
 */

const DocsViewer = {
  // Base path for content files (relative to /docs/viewer)
  basePath: '../',

  // Static file tree - Hard allowlist for security
  // These are the IDs used in the URL hash
  fileTree: [
    { name: 'ARCHITECTURE.md', type: 'file', path: '../ARCHITECTURE.md' },
    { name: 'BRANDING.md', type: 'file', path: '../BRANDING.md' },
    { name: 'INVARIANTS.md', type: 'file', path: '../INVARIANTS.md' },
    { name: 'LOCAL-LLM-SETUP.md', type: 'file', path: '../LOCAL-LLM-SETUP.md' },
    { name: 'MODEL-PROVISIONING.md', type: 'file', path: '../MODEL-PROVISIONING.md' },
    { name: 'OSCR-INTEGRATION.md', type: 'file', path: '../OSCR-INTEGRATION.md' },
    { name: 'ROADMAP.md', type: 'file', path: '../ROADMAP.md' },
    { name: 'SCOPE.md', type: 'file', path: '../SCOPE.md' },
    { name: 'config-schema.md', type: 'file', path: '../config-schema.md' },
    { name: 'cost-controls.md', type: 'file', path: '../cost-controls.md' },
    { name: 'github-setup.md', type: 'file', path: '../github-setup.md' },
    { name: 'security.md', type: 'file', path: '../security.md' },
  ],

  // Get flat list of allowed paths for validation
  getAllowedPaths() {
    return this.fileTree.map((item) => item.name);
  },

  // Application state
  state: {
    currentFile: null,
    compareFile: null,
    compareMode: false,
  },

  // Cache for loaded content (id -> html)
  contentCache: new Map(),

  // Icons
  icons: {
    markdown: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`,
    compare: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="18" rx="1"></rect><rect x="14" y="3" width="7" height="18" rx="1"></rect></svg>`,
    close: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
  },

  // Build file tree
  buildTree(items, parentUl, paneId = 'primary') {
    items.sort((a, b) => a.name.localeCompare(b.name));

    for (const item of items) {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = '#';
      a.className = 'file-link';
      a.innerHTML = `${this.icons.markdown}<span class="name">${item.name}</span>`;
      a.onclick = (e) => {
        e.preventDefault();
        this.loadFile(item.name, paneId);
      };
      li.appendChild(a);
      parentUl.appendChild(li);
    }
  },

  // Load file content with security validation
  async loadFile(fileId, paneId = 'primary') {
    // 1. Path Traversal Defense: Validate against allowlist
    const allowed = this.getAllowedPaths();
    if (!allowed.includes(fileId)) {
      console.error('Blocked attempt to load unauthorized file:', fileId);
      return;
    }

    const contentDiv = document.getElementById(
      paneId === 'primary' ? 'content-primary' : 'content-secondary'
    );
    const headerDiv = contentDiv.querySelector('.content-header');
    const bodyDiv = contentDiv.querySelector('.content-body');

    // Update state
    if (paneId === 'primary') {
      this.state.currentFile = fileId;
    } else {
      this.state.compareFile = fileId;
    }

    // Update header
    const filePathSlot = headerDiv.querySelector('.file-path-slot');
    if (filePathSlot) {
      filePathSlot.textContent = fileId;
    }

    // Update URL hash
    const newHash = this.getHashString();
    if (window.location.hash.slice(1) !== newHash) {
      window.location.hash = newHash;
    }

    // Highlight active file
    this.highlightActiveFile(fileId, paneId);

    // Cache check
    if (this.contentCache.has(fileId)) {
      bodyDiv.innerHTML = this.contentCache.get(fileId);
      this.attachContentListeners(bodyDiv, paneId);
      return true;
    }

    bodyDiv.innerHTML = '<div class="loading">Loading...</div>';

    try {
      const response = await fetch(`${this.basePath}${fileId}`);
      if (!response.ok) throw new Error('Failed to load file');
      const md = await response.text();

      // Ensure marked is ready
      if (typeof marked === 'undefined') throw new Error('Marked not loaded');

      const rawHtml = marked.parse(md);

      // 3. Security: Sanitize all rendered HTML
      if (typeof DOMPurify === 'undefined') throw new Error('DOMPurify not loaded');
      const cleanHtml = DOMPurify.sanitize(rawHtml, {
        USE_PROFILES: { html: true },
        ALLOWED_TAGS: [
          'h1',
          'h2',
          'h3',
          'h4',
          'h5',
          'h6',
          'p',
          'a',
          'ul',
          'ol',
          'li',
          'code',
          'pre',
          'blockquote',
          'table',
          'thead',
          'tbody',
          'tr',
          'th',
          'td',
          'hr',
          'img',
          'span',
          'div',
          'strong',
          'em',
          'del',
        ],
        ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'id'],
      });

      const finalHtml = `<div class="markdown-body">${cleanHtml}</div>`;
      bodyDiv.innerHTML = finalHtml;
      this.contentCache.set(fileId, finalHtml);

      this.attachContentListeners(bodyDiv, paneId);
      return true;
    } catch (error) {
      console.error(error);
      bodyDiv.innerHTML = `<div class="error">Error loading ${fileId}.</div>`;
      return false;
    }
  },

  // Attach listeners for link/image rewriting
  attachContentListeners(container, paneId) {
    // 4. Link Rewriting: Intercept internal .md links
    container.querySelectorAll('a').forEach((link) => {
      const href = link.getAttribute('href');
      if (href && href.endsWith('.md') && !href.startsWith('http')) {
        // Simplify link (remove ./ or ../ prefix if present for matching)
        const cleanHref = href.split('/').pop();
        if (this.getAllowedPaths().includes(cleanHref)) {
          link.onclick = (e) => {
            e.preventDefault();
            this.loadFile(cleanHref, paneId);
          };
        }
      }
    });

    // 5. Image Rewriting: Resolve relative images from parent docs dir
    container.querySelectorAll('img').forEach((img) => {
      const src = img.getAttribute('src');
      if (src && !src.startsWith('http') && !src.startsWith('data:') && !src.startsWith('/')) {
        img.src = `${this.basePath}${src}`;
      }
    });
  },

  // Highlight active file in tree
  highlightActiveFile(fileId, paneId) {
    const treeId = paneId === 'primary' ? 'tree-primary' : 'tree-secondary';
    const tree = document.getElementById(treeId);
    if (!tree) return;

    tree.querySelectorAll('.file-link').forEach((link) => {
      link.classList.remove('active');
      if (link.textContent.trim() === fileId) {
        link.classList.add('active');
      }
    });
  },

  // Toggle compare mode
  toggleCompareMode() {
    this.state.compareMode = !this.state.compareMode;
    const viewer = document.getElementById('viewer');
    const btn = document.getElementById('compare-btn');

    if (this.state.compareMode) {
      viewer.classList.add('compare-mode');
      btn.classList.add('active');
      btn.innerHTML = `${this.icons.close}<span>Exit Compare</span>`;

      const secondaryTree = document.getElementById('tree-secondary');
      if (secondaryTree && secondaryTree.children.length === 0) {
        this.buildTree(this.fileTree, secondaryTree, 'secondary');
      }
    } else {
      viewer.classList.remove('compare-mode');
      btn.classList.remove('active');
      btn.innerHTML = `${this.icons.compare}<span>Compare</span>`;
      this.state.compareFile = null;
    }

    const newHash = this.getHashString();
    if (window.location.hash.slice(1) !== newHash) {
      window.location.hash = newHash;
    }
  },

  // Get current hash string
  getHashString() {
    let hash = '';
    if (this.state.currentFile) {
      hash = this.state.currentFile;
      if (this.state.compareMode && this.state.compareFile) {
        hash += '|' + this.state.compareFile;
      }
    }
    return hash;
  },

  // Parse URL hash
  parseHash() {
    const hash = window.location.hash.slice(1);
    if (!hash) return null;

    const parts = hash.split('|');
    return {
      primary: parts[0] || null,
      secondary: parts[1] || null,
    };
  },

  // Show intro content
  showIntro() {
    const headerDiv = document.querySelector('#content-primary .content-header');
    const bodyDiv = document.querySelector('#content-primary .content-body');

    if (headerDiv) {
      const slot = headerDiv.querySelector('.file-path-slot');
      if (slot) slot.textContent = 'Welcome';
    }

    if (bodyDiv) {
      bodyDiv.innerHTML = `
        <div class="intro">
          <h1>📚 Documentation Viewer</h1>
          <p>
            Explore and compare documentation for <strong>odd-ai-reviewers</strong>. 
            Use the sidebar to browse or the <strong>Compare</strong> button for side-by-side review.
          </p>
          <div class="stats">
            <div class="stat">
              <span class="stat-value">12</span>
              <span class="stat-label">Documents</span>
            </div>
            <div class="stat">
              <span class="stat-value">100%</span>
              <span class="stat-label">Markdown</span>
            </div>
          </div>
        </div>
      `;
    }
  },

  // Initialize application
  async init() {
    // Basic marked setup
    if (typeof marked !== 'undefined') {
      marked.setOptions({
        headerIds: false,
        mangle: false,
      });
    }

    const primaryTree = document.getElementById('tree-primary');
    this.buildTree(this.fileTree, primaryTree, 'primary');

    const compareBtn = document.getElementById('compare-btn');
    compareBtn.onclick = () => this.toggleCompareMode();

    this.setupMobileMenu();
    this.setupPaneNavButtons();

    const hashState = this.parseHash();
    let loaded = false;

    if (hashState && hashState.primary) {
      loaded = await this.loadFile(hashState.primary, 'primary');
      if (loaded && hashState.secondary) {
        this.toggleCompareMode();
        await this.loadFile(hashState.secondary, 'secondary');
      }
    }

    if (!loaded) {
      this.showIntro();
    }

    window.onhashchange = async () => {
      const state = this.parseHash();
      if (state && state.primary && state.primary !== this.state.currentFile) {
        await this.loadFile(state.primary, 'primary');
      } else if (!state || !state.primary) {
        this.showIntro();
      }
    };
  },

  // Setup mobile menu
  setupMobileMenu() {
    const menuBtn = document.getElementById('menu-btn');
    const primarySidebar = document.getElementById('sidebar-primary');
    const overlay = document.getElementById('sidebar-overlay');

    if (!menuBtn || !primarySidebar || !overlay) return;

    menuBtn.onclick = () => {
      const primarySidebar = document.getElementById('sidebar-primary');
      const secondarySidebar = document.getElementById('sidebar-secondary');
      const overlay = document.getElementById('sidebar-overlay');

      if (this.state.compareMode && secondarySidebar) {
        if (primarySidebar.classList.contains('open')) {
          primarySidebar.classList.remove('open');
          secondarySidebar.classList.add('open');
        } else if (secondarySidebar.classList.contains('open')) {
          secondarySidebar.classList.remove('open');
          overlay.classList.remove('visible');
        } else {
          primarySidebar.classList.add('open');
          overlay.classList.add('visible');
        }
      } else {
        primarySidebar.classList.toggle('open');
        overlay.classList.toggle('visible');
      }
    };

    overlay.onclick = () => {
      primarySidebar.classList.remove('open');
      const secondarySidebar = document.getElementById('sidebar-secondary');
      if (secondarySidebar) secondarySidebar.classList.remove('open');
      overlay.classList.remove('visible');
    };
  },

  // Mobile navigation buttons
  setupPaneNavButtons() {
    const primaryNavBtn = document.getElementById('nav-btn-primary');
    const secondaryNavBtn = document.getElementById('nav-btn-secondary');

    if (primaryNavBtn) {
      primaryNavBtn.onclick = () => {
        document.getElementById('sidebar-primary').classList.add('open');
        document.getElementById('sidebar-overlay').classList.add('visible');
      };
    }

    if (secondaryNavBtn) {
      secondaryNavBtn.onclick = () => {
        const secondarySidebar = document.getElementById('sidebar-secondary');
        if (secondarySidebar) {
          secondarySidebar.classList.add('open');
          document.getElementById('sidebar-overlay').classList.add('visible');
        }
      };
    }
  },
};

document.addEventListener('DOMContentLoaded', () => DocsViewer.init());
