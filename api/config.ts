export const display_name = ()=>{
    const names = [
        'bazar',
        'oops',
        'not a name',
        'friend',
        'James',
        'Winner',
        'Azrael',
        'Puffo',
        'hola:)',
        'BlindBandit',
        'z80',
        '0b53rv3r',
        'Doctorr',
        'chimp',
        'stella',
        'TeXnix',
        'Imager',
        'Vandermonde',
        'taco',
        'Sims',
        'love you',
    ];

    return names[Math.floor(names.length*Math.random())];
};