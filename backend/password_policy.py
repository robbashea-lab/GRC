"""Bounded passphrases and versioned stdlib scrypt; retain legacy bcrypt reads."""
import base64
import hashlib
import hmac
import secrets
import re
from pathlib import Path
import bcrypt
from fastapi import HTTPException

BLOCKED = {'passwordpassword', 'passwordpasswordpassword', '123456789012345',
           '1234567890123456', 'qwertyuiopasdfgh', 'letmeinletmeinletmein',
           'correct horse battery staple', 'omnisciente', 'welcome to omnisciente'}
BLOCKED.update(word.casefold() for word in Path(__file__).with_name('common_passwords.txt').read_text(encoding='utf-8').splitlines())


def valid_hash(encoded):
    if re.fullmatch(r"\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}", encoded):
        return True
    try:
        algorithm, salt, digest = encoded.split('$')
        return algorithm == 'scrypt' and len(base64.b64decode(salt, validate=True)) == 16 and len(base64.b64decode(digest, validate=True)) == 32
    except (ValueError, TypeError):
        return False


def validate(password):
    if not 15 <= len(password) <= 128:
        raise HTTPException(422, 'Password must contain 15 to 128 characters')
    normalized = password.casefold().strip()
    if normalized in BLOCKED or len(set(normalized)) < 4:
        raise HTTPException(422, 'Choose a less common password or passphrase')


def derive(password, salt):
    return hashlib.scrypt(password.encode('utf-8'), salt=salt, n=2**17, r=8, p=1,
                          maxmem=256 * 1024 * 1024, dklen=32)


def hash_password(password):
    validate(password)
    salt = secrets.token_bytes(16)
    return 'scrypt$' + base64.b64encode(salt).decode() + '$' + base64.b64encode(derive(password, salt)).decode()


def verify_password(password, encoded):
    if len(password) > 128:
        return False
    try:
        if encoded.startswith('scrypt$'):
            _, salt, expected = encoded.split('$')
            salt, expected = base64.b64decode(salt, validate=True), base64.b64decode(expected, validate=True)
            return len(salt) == 16 and len(expected) == 32 and hmac.compare_digest(derive(password, salt), expected)
        return len(password.encode('utf-8')) <= 72 and bcrypt.checkpw(password.encode(), encoded.encode())
    except (ValueError, TypeError):
        return False
