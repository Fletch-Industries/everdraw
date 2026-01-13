# Contributing to Everdraw

Thank you for your interest in contributing to Everdraw! We welcome contributions from the community and are grateful for any help you can provide.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [How to Contribute](#how-to-contribute)
- [Development Setup](#development-setup)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Reporting Bugs](#reporting-bugs)
- [Suggesting Features](#suggesting-features)

## Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment. Please be kind and constructive in all interactions.

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/everdraw.git
   cd everdraw
   ```
3. **Add the upstream remote**:
   ```bash
   git remote add upstream https://github.com/Fletch-Industries/everdraw.git
   ```

## How to Contribute

### Types of Contributions

- **Bug fixes**: Help us squash bugs and improve stability
- **New features**: Add new brushes, tools, or capabilities
- **Performance improvements**: Optimize the rendering engine or brush algorithms
- **Documentation**: Improve README, add code comments, or create tutorials
- **UI/UX improvements**: Enhance the user interface and experience
- **Accessibility**: Make the app more accessible to all users

### Areas We'd Love Help With

- Additional brush types and presets
- WebGL shader optimizations
- Touch gesture improvements
- Internationalization (i18n)
- AuthSig and UHRP integration enhancements
- Mobile/tablet optimizations

## Development Setup

### Prerequisites

- Node.js 18+ (LTS recommended)
- npm or bun package manager
- Modern browser with WebGL2 support

### Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Run linting
npm run lint
```

### Project Structure

```
everdraw/
├── src/
│   ├── components/     # React components
│   │   ├── ui/         # Reusable UI components (shadcn/ui)
│   │   └── BrushStudio/ # Brush customization components
│   ├── hooks/          # Custom React hooks
│   ├── utils/          # Utility functions and engines
│   │   ├── brushEngine.ts      # Core brush rendering
│   │   ├── webglPaintEngine.ts # WebGL rendering engine
│   │   └── strokeSmoothing.ts  # Input smoothing algorithms
│   ├── types/          # TypeScript type definitions
│   └── pages/          # Page components
├── public/             # Static assets
└── index.html          # Entry HTML file
```

## Pull Request Process

1. **Create a feature branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** and commit with clear, descriptive messages:
   ```bash
   git commit -m "feat: add new watercolor brush variant"
   ```

3. **Keep your branch updated**:
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

4. **Push your branch** and create a Pull Request:
   ```bash
   git push origin feature/your-feature-name
   ```

5. **Fill out the PR template** with:
   - Clear description of changes
   - Screenshots/videos for UI changes
   - Testing steps performed
   - Related issues (if any)

6. **Address review feedback** promptly

### Commit Message Format

We follow conventional commits:

- `feat:` New features
- `fix:` Bug fixes
- `perf:` Performance improvements
- `refactor:` Code refactoring
- `docs:` Documentation changes
- `style:` Code style changes (formatting, etc.)
- `test:` Adding or updating tests
- `chore:` Maintenance tasks

## Coding Standards

### TypeScript

- Use TypeScript for all new code
- Define proper types and interfaces
- Avoid `any` types when possible
- Use meaningful variable and function names

### React

- Use functional components with hooks
- Keep components focused and composable
- Use `useCallback` and `useMemo` for performance-critical code
- Follow the existing component structure

### Styling

- Use Tailwind CSS for styling
- Follow the existing design system
- Use the `cn()` utility for conditional classes
- Keep dark mode compatibility in mind

### Performance

- Be mindful of canvas/WebGL performance
- Avoid unnecessary re-renders
- Profile changes that affect the brush engine
- Test on both desktop and mobile devices

## Reporting Bugs

When reporting bugs, please include:

1. **Environment details**: Browser, OS, device type
2. **Steps to reproduce**: Clear, numbered steps
3. **Expected behavior**: What should happen
4. **Actual behavior**: What actually happens
5. **Screenshots/recordings**: If applicable
6. **Console errors**: Any relevant error messages

Use the [GitHub Issues](https://github.com/Fletch-Industries/everdraw/issues) page with the "bug" label.

## Suggesting Features

For feature requests:

1. **Check existing issues** to avoid duplicates
2. **Describe the use case**: Why is this feature needed?
3. **Propose a solution**: How might it work?
4. **Consider alternatives**: Other ways to solve the problem

Use the [GitHub Issues](https://github.com/Fletch-Industries/everdraw/issues) page with the "enhancement" label.

## Questions?

Feel free to open a [Discussion](https://github.com/Fletch-Industries/everdraw/discussions) for questions, ideas, or general chat about the project.

---

Thank you for contributing to Everdraw! Your help makes this project better for everyone. 🎨
