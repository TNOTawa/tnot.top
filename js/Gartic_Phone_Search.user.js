// ==UserScript==
// @name         Gartic Phone 查词工具
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  在 Gartic Phone（传话游戏）中添加一个查询按钮，便于搜索不会的词（默认bing搜索）
// @author       TNOT&GPT
// @match        https://garticphone.com/zh-CN/draw*
// @updateURL    http://tnot.top/js/path/to/Gartic_Phone_Search.meta.js
// @downloadURL  http://tnot.top/js/Gartic_Phone_Search.user.js
// @grant        none
// ==/UserScript==


(function() {
    'use strict';

    function createSearchButton(word) {
        const searchButton = document.createElement('button');
        searchButton.innerText = '搜索';
        searchButton.style.margin = '10px';
        searchButton.style.padding = '5px 10px';
        searchButton.style.border = 'none';
        searchButton.style.borderRadius = '5px';
        searchButton.style.backgroundColor = 'rgba(0, 123, 255, 0.5)'; // 蓝色半透明
        searchButton.style.color = 'white';
        searchButton.style.cursor = 'pointer';
        searchButton.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.1)';
        searchButton.onmouseover = function() {
            this.style.backgroundColor = 'rgba(0, 123, 255, 0.7)';
        };
        searchButton.onmouseout = function() {
            this.style.backgroundColor = 'rgba(0, 123, 255, 0.5)';
        };
        searchButton.onclick = function() {
            if (word) {
                const url = `https://www.bing.com/search?q=${encodeURIComponent(word)}`;
                window.open(url, '_blank');
            }
        };
        return searchButton;
    }

    function addButtonToElement(selector, nextElement = false) {
        const elements = document.querySelectorAll(selector);
        elements.forEach(element => {
            const word = element.textContent || '';
            if (!element.nextElementSibling || !element.nextElementSibling.matches('button')) {
                const searchButton = createSearchButton(word);
                if (nextElement) {
                    element.parentNode.insertBefore(searchButton, element.nextSibling);
                } else {
                    element.parentNode.appendChild(searchButton);
                }
            }
        });
    }

    function tryToAddButtons() {
        addButtonToElement('h3.jsx-a516bc832356093b', true); // 在h3后面添加按钮
        addButtonToElement('p.jsx-955cc0a80f154e41'); // 在p下面添加按钮
    }

    // 设置定时器，每秒检查一次
    setInterval(tryToAddButtons, 1000);
})();