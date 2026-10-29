import { Coin, Flag, ItemBox, Star } from '../components/Icons';
import { Logo } from '../components/TopBar';
import { importBackup, loadDemo } from '../lib/actions';
import { go } from '../lib/router';
import { useT } from '../store/store';

export function Welcome() {
  const t = useT();
  return (
    <div className="welcome">
      <div className="welcome-hero">
        <div className="float-deco" aria-hidden="true">
          <ItemBox size={64} className="deco deco-1" />
          <Coin size={40} className="deco deco-2" />
          <Star size={48} className="deco deco-3" />
          <Flag size={52} className="deco deco-4" />
        </div>
        <Logo />
        <h1 className="display">{t('welcome.title')}</h1>
        <p className="lead">{t('welcome.body')}</p>
        <div className="welcome-actions">
          <button className="btn btn-red btn-xl" onClick={() => go('setup')} data-testid="new-tournament">
            {t('welcome.new')}
          </button>
          <button className="btn btn-gold btn-lg" onClick={() => void loadDemo().then((ok) => ok && go(''))} data-testid="load-demo">
            {t('welcome.demo')}
          </button>
          <button className="btn btn-white btn-lg" onClick={() => void importBackup().then((ok) => ok && go(''))}>
            {t('welcome.import')}
          </button>
        </div>
      </div>
    </div>
  );
}
