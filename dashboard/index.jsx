import React from 'react';
import { createRoot } from 'react-dom/client';
import Dashboard from './Dashboard.jsx';
import '../styles/tailwind.css';

const root = createRoot(document.getElementById('root'));
root.render(<Dashboard />);
