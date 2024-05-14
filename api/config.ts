export const display_name = ()=>{
    const names = [
        'bazar',
        'oops',
        'not a name',
        'friend',
        'James',
        'Winner',
    ];

    return names[Math.floor(names.length*Math.random())];
};