// ==UserScript==
// @name         Torn Player Level API
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Get a player's level by ID using the Torn API
// @author       TornAPIJS
// @match        https://www.torn.com/*
// @match        https://api.torn.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @connect      api.torn.com
// @license      MIT
// ==/UserScript==

(function () {
    'use strict';

    const API_BASE = 'https://api.torn.com';
    const STORAGE_KEY = 'torn_api_key';

    /**
     * Get your API key from: https://www.torn.com/preferences.php#tab=api
     * Key is stored locally in Tampermonkey (GM_getValue). Set it once below or via setApiKey() in console.
     */
    function getStoredKey() {
        return GM_getValue(STORAGE_KEY, '');
    }

    function setStoredKey(key) {
        GM_setValue(STORAGE_KEY, key);
    }

    /**
     * Fetch player level by ID from Torn API.
     * @param {number|string} playerId - Torn player ID
     * @returns {Promise<number|null>} Player level or null on error
     */
    async function getPlayerLevel(playerId) {
        const key = getStoredKey();
        if (!key) {
            console.warn('[Torn Level API] No API key set. Set it via setTornApiKey("your_key") or in script storage.');
            return null;
        }

        const url = `${API_BASE}/user/${playerId}?selections=profile&key=${key}`;

        return new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url,
                onload(res) {
                    try {
                        const data = JSON.parse(res.responseText);
                        if (data.error) {
                            console.warn('[Torn Level API]', data.error);
                            resolve(null);
                            return;
                        }
                        const level = (data.level != null ? data.level : (data.profile && data.profile.level != null ? data.profile.level : null));
                        resolve(level != null ? Number(level) : null);
                    } catch (e) {
                        console.warn('[Torn Level API] Parse error', e);
                        resolve(null);
                    }
                },
                onerror() {
                    console.warn('[Torn Level API] Request failed');
                    resolve(null);
                }
            });
        });
    }

    /**
     * Set your Torn API key (stored locally). Call from console: setTornApiKey("your_16_char_key")
     */
    window.setTornApiKey = function (key) {
        if (key && typeof key === 'string') {
            setStoredKey(key.trim());
            console.log('[Torn Level API] API key saved.');
        }
    };

    /**
     * Get player level by ID. Call from console: getPlayerLevel(12345) or await getPlayerLevel(12345)
     */
    window.getPlayerLevel = getPlayerLevel;

    /* Optional: small UI to get level by ID */
    function injectUI() {
        if (document.getElementById('torn-level-api-panel')) return;

        const panel = document.createElement('div');
        panel.id = 'torn-level-api-panel';
        panel.innerHTML = `
            <div style="
                position: fixed; bottom: 16px; right: 16px; z-index: 999999;
                background: #1a1a2e; color: #eee; padding: 12px 16px; border-radius: 8px;
                font-family: sans-serif; font-size: 13px; box-shadow: 0 4px 12px rgba(0,0,0,0.4);
            ">
                <div style="font-weight: bold; margin-bottom: 8px;">Player Level</div>
                <input type="text" id="torn-level-api-id" placeholder="Player ID" style="
                    width: 100px; padding: 4px 8px; margin-right: 6px; border: 1px solid #444; border-radius: 4px; background: #16213e; color: #eee;
                ">
                <button id="torn-level-api-btn" style="
                    padding: 4px 10px; background: #e94560; border: none; border-radius: 4px; color: #fff; cursor: pointer;
                ">Get Level</button>
                <div id="torn-level-api-result" style="margin-top: 8px; min-height: 18px;"></div>
            </div>
        `;
        document.body.appendChild(panel);

        const input = panel.querySelector('#torn-level-api-id');
        const btn = panel.querySelector('#torn-level-api-btn');
        const result = panel.querySelector('#torn-level-api-result');

        btn.addEventListener('click', async () => {
            const id = input.value.trim();
            if (!id) {
                result.textContent = 'Enter a player ID';
                return;
            }
            result.textContent = '…';
            const level = await getPlayerLevel(id);
            result.textContent = level != null ? `Level: ${level}` : 'Error (check key/ID)';
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectUI);
    } else {
        injectUI();
    }
})();
