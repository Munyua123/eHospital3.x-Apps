import React from 'react';
import { useTranslation } from 'react-i18next';
import { SideNav } from '@carbon/react';
import { attach, ExtensionSlot, isDesktop, useLayoutType } from '@openmrs/esm-framework';
import styles from './left-panel.scss';

attach('nav-menu-slot', 'billing-left-panel');

const LeftPanel: React.FC = () => {
  const { t } = useTranslation();
  const layout = useLayoutType();

  return (
    isDesktop(layout) && (
      <SideNav
        aria-label={t('messagesLeftPanel', 'Messages left panel')}
        className={styles.leftPanel}
        expanded>
        <ExtensionSlot name="messages-left-panel-slot" />
      </SideNav>
    )
  );
};

export default LeftPanel;
