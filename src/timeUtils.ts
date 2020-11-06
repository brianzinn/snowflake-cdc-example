// ie: "03/11/2020 17:10:49"
export const fullDateFormat = (date?: Date): string => {
    const parts = new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour12: false, // we have 17:10 in our sample file
        hour: '2-digit',
        minute: 'numeric',
        second: 'numeric',
        timeZone: 'America/Toronto'
    } as Intl.DateTimeFormatOptions).formatToParts(date);

    return parts.map(({ type, value }) => {
        switch (type) {
            // skip other literals.  Like ','.
            // 11/21/2019, 17:10:49 ==> 11/21/2019 17:10:49
            case 'literal': return /[/:]/.test(value) ? value : ' ';
            default: return value;
        }
    }).reduce((string, part) => string + part);
}

// ie: 2020/11/22
export const yyyymmddPathFormat = (date: Date, separator: string): string => {
    const parts = new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        timeZone: 'America/Toronto'
    } as Intl.DateTimeFormatOptions).formatToParts(date);

    const order = ['year', 'month', 'day'];
    return order.reduce((prev, cur) => {
        prev.push(parts.find(t => t.type === cur).value)
        return prev;
    }, []).join(separator);
}