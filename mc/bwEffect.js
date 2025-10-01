document.addEventListener("DOMContentLoaded", function() {
    const datesToSetBW = [
        { month: 12, day: 13 },  // 国家公祭日
        { month: 9, day: 18 },   // 九一八
        { month: 7, day: 7 },    // 七七事变
		{ month: 4, day: 4 }    // 44
    ];
    
    const today = new Date();
    const todayMonth = today.getMonth() + 1;  // getMonth() returns 0-11, so +1 to match 1-12
    const todayDay = today.getDate();
    
    const isBwDay = datesToSetBW.some(date => date.month === todayMonth && date.day === todayDay);
    
    if (isBwDay) {
        const style = document.createElement("style");
        style.innerHTML = `
            html {
                filter: grayscale(100%);
            }
        `;
        document.head.appendChild(style);
    }
});