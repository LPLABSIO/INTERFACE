# UI Design System Documentation

## Overview
The unified design system provides a consistent, professional interface for the Bot Manager application. This document outlines the design principles, components, and usage guidelines.

## Design Principles

### 1. Clarity & Simplicity
- Clean, minimal interface without visual clutter
- Clear hierarchy of information
- Consistent spacing and alignment

### 2. Professional Aesthetics
- Dark theme optimized for extended use
- Subtle gradients and shadows for depth
- No decorative emojis in the interface

### 3. Responsive & Accessible
- Works on various screen sizes
- WCAG 2.1 AA compliance
- Keyboard navigation support

## Color System

### Primary Palette
```css
--primary-600: #4F46E5  /* Main brand color */
--primary-700: #4338CA  /* Hover state */
--primary-100: #E0E7FF  /* Light variant */
```

### Semantic Colors
```css
--success: #10B981    /* Green - positive actions */
--warning: #F59E0B    /* Yellow - caution states */
--danger: #EF4444     /* Red - errors/stop */
--info: #3B82F6       /* Blue - information */
```

### Neutral Scale
```css
--gray-900: #0F172A   /* Darkest - backgrounds */
--gray-800: #1E293B   /* Dark - cards */
--gray-700: #334155   /* Borders */
--gray-500: #64748B   /* Muted text */
--gray-100: #F1F5F9   /* Light text */
```

## Typography

### Font Stack
```css
--font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
--font-mono: 'SF Mono', Monaco, 'Cascadia Code', monospace;
```

### Size Scale
```css
--text-xs: 0.75rem    /* 12px - labels */
--text-sm: 0.875rem   /* 14px - body small */
--text-base: 1rem     /* 16px - body */
--text-lg: 1.125rem   /* 18px - subheadings */
--text-xl: 1.25rem    /* 20px - headings */
```

## Spacing System

Uses consistent 4px base unit:
```css
--space-xs: 0.25rem   /* 4px */
--space-sm: 0.5rem    /* 8px */
--space-md: 1rem      /* 16px */
--space-lg: 1.5rem    /* 24px */
--space-xl: 2rem      /* 32px */
```

## Components

### Buttons

#### Primary Button
```html
<button class="btn btn--primary">Action</button>
```
- Used for main actions
- Blue gradient background
- White text

#### Secondary Button
```html
<button class="btn btn--secondary">Secondary</button>
```
- Used for secondary actions
- Gray background
- Light gray text

#### Ghost Button
```html
<button class="btn btn--ghost">Cancel</button>
```
- Transparent background
- Border only
- Used for tertiary actions

### Cards

```html
<div class="status-card">
    <div class="status-card__header">
        <span class="status-card__icon">🤖</span>
        <h3 class="status-card__title">Title</h3>
    </div>
    <div class="status-card__body">
        <!-- Content -->
    </div>
</div>
```

### Badges

```html
<span class="badge badge--success">Active</span>
<span class="badge badge--warning">Pending</span>
<span class="badge badge--danger">Error</span>
```

### Form Elements

#### Input
```html
<input type="text" class="input" placeholder="Enter value">
```

#### Select
```html
<select class="select">
    <option>Option 1</option>
    <option>Option 2</option>
</select>
```

#### Checkbox
```html
<label class="checkbox">
    <input type="checkbox">
    <span>Label</span>
</label>
```

## Layout Structure

### Grid System
- Sidebar: Fixed 300px width
- Main content: Flexible
- Header: Fixed 64px height

### Responsive Breakpoints
```css
@media (max-width: 1200px)  /* Tablet landscape */
@media (max-width: 768px)   /* Tablet portrait */
@media (max-width: 480px)   /* Mobile */
```

## Animation & Transitions

### Standard Timing
```css
--transition-fast: 150ms cubic-bezier(0.4, 0, 0.2, 1);
--transition-base: 250ms cubic-bezier(0.4, 0, 0.2, 1);
--transition-slow: 350ms cubic-bezier(0.4, 0, 0.2, 1);
```

### Common Animations
- Fade in: `fadeIn 250ms ease`
- Slide in: `slideIn 350ms ease`
- Scale: `scale 150ms ease`

## State Management

### Visual States
- **Default**: Base appearance
- **Hover**: Slight elevation, color shift
- **Active**: Pressed appearance
- **Focus**: Outline for accessibility
- **Disabled**: 50% opacity

### Device States
- **Available**: Green indicator
- **Busy**: Yellow indicator
- **Error**: Red indicator
- **Offline**: Gray indicator

## Accessibility

### Focus Management
- All interactive elements have focus states
- Tab order follows logical flow
- Skip links for navigation

### ARIA Labels
```html
<button aria-label="Start bot process">Start</button>
<div role="status" aria-live="polite">Status message</div>
```

### Contrast Ratios
- Normal text: 7:1 minimum
- Large text: 4.5:1 minimum
- Interactive elements: 3:1 minimum

## File Organization

```
src/ui/renderer/
├── index.html              # Main HTML
├── styles-unified.css      # Unified styles
├── renderer.js             # Main JavaScript
├── ui-enhancements.js      # UI utilities
├── logs-enhanced.js        # Log system
└── multi-actions.js        # Batch actions
```

## Usage Guidelines

### DO's
- Use semantic HTML elements
- Apply BEM naming for custom classes
- Test on multiple screen sizes
- Maintain consistent spacing

### DON'Ts
- Don't use inline styles
- Don't add decorative emojis
- Don't create one-off color values
- Don't skip heading levels

## Migration from Old UI

### Key Changes
1. Removed all emojis from UI elements
2. Consolidated navigation into single bar
3. Unified color scheme across all views
4. Standardized component styling
5. Improved log readability

### Backward Compatibility
- All element IDs maintained
- Event listeners unchanged
- IPC communication preserved
- State management intact

## Future Enhancements

### Planned Features
- Dark/Light theme toggle
- Custom accent colors
- Advanced log filtering
- Keyboard shortcuts
- Drag & drop support

### Performance Optimizations
- Virtual scrolling for logs
- Lazy loading for device details
- CSS containment for cards
- Web Workers for heavy processing

## Support & Maintenance

### Browser Support
- Chrome/Edge 90+
- Safari 14+
- Firefox 88+
- Electron 13+

### Testing Checklist
- [ ] All buttons functional
- [ ] Modal opens/closes
- [ ] Logs display correctly
- [ ] Device selection works
- [ ] Settings save properly
- [ ] Navigation consistent
- [ ] Responsive on all sizes
- [ ] Keyboard navigation works