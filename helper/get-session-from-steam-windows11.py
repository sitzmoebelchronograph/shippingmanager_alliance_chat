import sqlite3
import os
import win32crypt
import base64
import json
import urllib.parse
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend
import sys

# --- 1. Path Configuration ---
# Correct path to the Steam Chromium core's Cookies database
COOKIE_PATH = os.path.join(
    os.environ['USERPROFILE'],
    'AppData',
    'Local',
    'Steam',
    'htmlcache',
    'Network', 
    'Cookies'
)
# Path to LocalPrefs.json, which contains the encrypted AES key
LOCAL_PREFS_PATH = os.path.join(
    os.environ['USERPROFILE'],
    'AppData',
    'Local',
    'Steam',
    'htmlcache',
    'LocalPrefs.json' 
)
TARGET_DOMAIN = 'shippingmanager.cc'
TARGET_COOKIE_NAME = 'shipping_manager_session' 

# --- 2. AES-GCM Decryption ---
def decrypt_aes_gcm(encrypted_value: bytes, key: bytes) -> str | None:
    """Decrypts the encrypted cookie value using AES-256-GCM."""
    try:
        # The first 3 bytes are the 'v10' or 'v11' prefix
        encrypted_value_bytes = encrypted_value[3:]
        
        # AES-GCM Structure: Nonce (12) | Ciphertext | Auth Tag (16)
        nonce = encrypted_value_bytes[:12]
        ciphertext_with_tag = encrypted_value_bytes[12:]
        
        # The Auth Tag is the last 16 bytes
        tag = ciphertext_with_tag[-16:]
        ciphertext = ciphertext_with_tag[:-16]

        cipher = Cipher(algorithms.AES(key), modes.GCM(nonce, tag), backend=default_backend())
        decryptor = cipher.decryptor()
        
        decrypted_payload = decryptor.update(ciphertext) + decryptor.finalize()
        
        return decrypted_payload.decode('utf-8')
        
    except Exception:
        return None

# --- 3. DPAPI Function for AES Key Retrieval ---
def get_aes_key(prefs_path: str) -> bytes | None:
    """Extracts and decrypts the DPAPI-protected AES key from LocalPrefs.json."""
    try:
        with open(prefs_path, 'r', encoding='utf-8') as f:
            prefs_data = json.load(f)
            
        encrypted_key_b64 = prefs_data['os_crypt']['encrypted_key']
        
        # Base64 decode
        encrypted_key_bytes = base64.b64decode(encrypted_key_b64)
        
        # DPAPI decryption (skips the 'DPAPI' header [5 bytes])
        _, decrypted_key = win32crypt.CryptUnprotectData(
            encrypted_key_bytes[5:], 
            None, 
            None, 
            None, 
            0
        )
        return decrypted_key
        
    except Exception as e:
        # Send error to stderr so the stdout remains clean for Node.js
        print(f"[-] ERROR decrypting AES key (DPAPI): {e}", file=sys.stderr)
        return None

# --- 4. Main Function (Two Stages) ---
def get_decrypted_cookie_full(db_path: str, prefs_path: str, domain: str, target_name: str):
    
    # 1. Retrieve AES Key (DPAPI)
    aes_key = get_aes_key(prefs_path)
    if not aes_key:
        print("[-] CRITICAL ERROR: Failed to retrieve AES key. Aborting.", file=sys.stderr)
        return

    # 2. Decrypt Cookies (AES)
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        cursor.execute(f"SELECT name, encrypted_value FROM cookies WHERE host_key LIKE '%{domain}'")
        results = cursor.fetchall()
        
        if not results:
            print(f"[-] ERROR: No cookies found for domain '{domain}'.", file=sys.stderr)
            return
        
        for name, encrypted_value in results:
            
            decrypted_payload_utf8 = decrypt_aes_gcm(encrypted_value, aes_key)
            
            if decrypted_payload_utf8 is None:
                 continue 
            
            # Final value is URL-decoded and stripped of whitespace
            final_token = urllib.parse.unquote(decrypted_payload_utf8).strip()
            
            if name == target_name and final_token: 
                
                # *** FULFILLS NODE.JS REQUIREMENT ***
                # Prints ONLY the raw token to stdout for the wrapper to capture.
                print(final_token)
                return # Success! Exit the script.
            
    except sqlite3.OperationalError:
        print("\n!!! CRITICAL ERROR: DATABASE LOCKED (Steam is running) !!!", file=sys.stderr)
    except Exception as e:
        print(f"[-] CRITICAL ERROR during cookie decryption: {e}", file=sys.stderr)
    finally:
        if 'conn' in locals() and conn:
            conn.close()

# --- Execution ---
if __name__ == "__main__":
    
    print(f"[*] Starting decryption for '{TARGET_DOMAIN}'...", file=sys.stderr)
    
    if not os.path.exists(COOKIE_PATH):
        print(f"[-] CRITICAL ERROR: Cookies database not found at {COOKIE_PATH}", file=sys.stderr)
        sys.exit(1)
    elif not os.path.exists(LOCAL_PREFS_PATH):
        print(f"[-] CRITICAL ERROR: LocalPrefs.json not found at {LOCAL_PREFS_PATH}", file=sys.stderr)
        sys.exit(1)
    else:
        get_decrypted_cookie_full(COOKIE_PATH, LOCAL_PREFS_PATH, TARGET_DOMAIN, TARGET_COOKIE_NAME)
        sys.exit(0)