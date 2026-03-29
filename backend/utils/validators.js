// ================= LANGUAGE VALIDATION (client-side) =================

// ================= EMAIL VALIDATION =================

// List of allowed email domains (popular providers only)
const ALLOWED_EMAIL_DOMAINS = new Set([
    'gmail.com',
    'yahoo.com',
    'outlook.com',
    'hotmail.com',
    'icloud.com',
    'protonmail.com',
    'aol.com',
    'mail.com',
    'zoho.com',
    'yandex.com',
    'gmx.com',
    'live.com',
    'msn.com',
    'yahoo.co.in',
    'yahoo.co.uk',
    'rediffmail.com',
    'fastmail.com'
]);

export function isValidEmail(email) {
    if (!email || typeof email !== 'string') return false;

    // Basic email regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

    if (!emailRegex.test(email)) return false;

    // Extract domain
    const domain = email.split('@')[1];
    if (!domain) return false;

    // Convert to lowercase for comparison
    const domainLower = domain.toLowerCase();

    // Check if domain is in allowed list
    if (!ALLOWED_EMAIL_DOMAINS.has(domainLower)) {
        return false;
    }

    return true;
}

export function getEmailValidationError(email) {
    if (!email || typeof email !== 'string') {
        return 'Email is required';
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (!emailRegex.test(email)) {
        return 'Please enter a valid email format';
    }

    const domain = email.split('@')[1];
    if (!domain) {
        return 'Invalid email domain';
    }

    const domainLower = domain.toLowerCase();
    if (!ALLOWED_EMAIL_DOMAINS.has(domainLower)) {
        return 'Please use an email from a supported provider (Gmail, Yahoo, Outlook, etc.)';
    }

    return null; // No error
}

export function splitSkills(skillString) {
    if (!skillString) return [];
    if (Array.isArray(skillString)) return skillString;
    return String(skillString).split(',').map(s => s.trim()).filter(Boolean);
}

export function normalizeLang(input) {
    if (!input) return '';
    return input.trim();
}

export function isValidLanguage(input) {
    if (!input) return false;
    const skills = splitSkills(input);
    return skills.length > 0;
}

// UI helpers: attach an error message element next to a field and toggle messages
function ensureFieldErrorEl(field) {
    if (!field) return null;
    let el = field.nextElementSibling;
    if (el && el.classList && el.classList.contains('field-error')) return el;
    // create error element
    el = document.createElement('div');
    el.className = 'field-error text-red-400 text-sm mt-1';
    field.parentNode.insertBefore(el, field.nextSibling);
    return el;
}

export function validateFieldAndShow(field) {
    if (!field) return false;
    const val = field.value || '';
    const msgEl = ensureFieldErrorEl(field);
    if (!val) {
        if (msgEl) msgEl.textContent = '';
        field.classList.remove('border-red-500');
        field.classList.remove('border-green-500');
        return false;
    }
    if (isValidLanguage(val)) {
        if (msgEl) msgEl.textContent = '';
        field.classList.remove('border-red-500');
        field.classList.add('border-green-500');
        return true;
    } else {
        if (msgEl) msgEl.textContent = 'Please enter at least one skill.';
        field.classList.add('border-red-500');
        field.classList.remove('border-green-500');
        return false;
    }
}

// Attach realtime validation to a field by id
export function attachLanguageValidationToField(fieldId) {
    const field = document.getElementById(fieldId);
    if (!field) return;
    // validate while typing
    field.addEventListener('input', () => validateFieldAndShow(field));
    // validate on blur as well
    field.addEventListener('blur', () => validateFieldAndShow(field));
    // create the error element now (so layout doesn't jump)
    ensureFieldErrorEl(field);
}

// Attach email validation to email field
export function attachEmailValidationToField(fieldId) {
    const field = document.getElementById(fieldId);
    if (!field) return;

    const errorEl = ensureFieldErrorEl(field);

    const validate = () => {
        const email = field.value.trim();
        if (!email) {
            if (errorEl) errorEl.textContent = '';
            field.classList.remove('border-red-500');
            field.classList.remove('border-green-500');
            return false;
        }

        const error = getEmailValidationError(email);

        if (!error) {
            if (errorEl) errorEl.textContent = '';
            field.classList.remove('border-red-500');
            field.classList.add('border-green-500');
            return true;
        } else {
            if (errorEl) errorEl.textContent = error;
            field.classList.add('border-red-500');
            field.classList.remove('border-green-500');
            return false;
        }
    };

    field.addEventListener('input', validate);
    field.addEventListener('blur', validate);
}