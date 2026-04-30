import { Dialog } from 'primereact/dialog'
import { useTranslation } from 'react-i18next'

interface Props {
  visible: boolean
  onHide: () => void
}

export function AboutDialog({ visible, onHide }: Props) {
  const { t } = useTranslation()

  const header = (
    <div className="flex align-items-center gap-3">
      <img
        src="/icons/favicon-256x256.png"
        alt={t('common.title')}
        style={{ height: '2.5rem', width: 'auto' }}
      />
      <span>{t('common.title')}</span>
      <span className="text-color-secondary text-base font-normal">v{__APP_VERSION__}</span>
    </div>
  )

  return (
    <Dialog
      header={header}
      visible={visible}
      onHide={onHide}
      style={{ width: '50%' }}
      modal
      dismissableMask
    >
      <p className="mb-2 line-height-3">
        Welcome to the Eco Crafter Toolkit! The goal of this application is to provide players of{' '}
        <a href="https://play.eco" target="_blank" rel="noopener noreferrer">
          Eco
        </a>{' '}
        with tools to help manage the crafting and economic aspects of the game. This app is free to
        use, and records no information about you (all the data is stored locally in your browser).
      </p>

      <p className="mb-2 line-height-3">
        If the first thing you thought when opening this app was "Wow, it looks a heck of a lot like{' '}
        <a href="https://eco-gnome.com" target="_blank" rel="noopener noreferrer">
          Eco Gnome
        </a>
        ", you're right! I've been a long-time user of Eco Gnome, as well as other calculators like{' '}
        <a href="https://eco-calc.com" target="_blank" rel="noopener noreferrer">
          Eco Crafting Calculator
        </a>{' '}
        and{' '}
        <a
          href="https://mod.io/g/eco/m/eco-price-calculator"
          target="_blank"
          rel="noopener noreferrer"
        >
          uCat's Price Calculator
        </a>
        . Eco Gnome was by far my favorite, but as time went on it didn't receive updates to support
        the changes in v13 of Eco, and there was a growing list of features I thought would be great
        to add. So, one rainy weekend I started hacking, and here we are: a new Eco calculator tool,
        heavily inspired by the great work of Eco Gnome, but with some new bells and whistles.
      </p>

      <p className="mb-2 line-height-3">
        This app is still a bit new, so there's bound to be bugs. Please have patience, I'll squash
        them as fast as I'm able.
      </p>
    </Dialog>
  )
}
