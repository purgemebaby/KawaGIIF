import { useEffect, useState } from 'react';
import { greetHome, homeGreetingPending } from '../../lib/mascot';
import homeChibi from '../../assets/mascot/home.webp';
import './Mascot.css';

// Slides in at launch and after every Editor visit; Home only mounts it once it is really on screen.
function HomeMascot() {
	const [entering] = useState(homeGreetingPending);

	useEffect(greetHome, []);

	return (
		<img
			className={entering ? 'home-mascot is-entering' : 'home-mascot'}
			src={homeChibi}
			alt=""
			draggable={false}
			decoding="async"
		/>
	);
}

export default HomeMascot;
