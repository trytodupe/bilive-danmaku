export enum UserInfoDaoNS {
  UserInfoUid = 'UserInfoUid',
  UserInfoSession = 'UserInfoSession',
  UserInfoImgKey = 'UserInfoImgKey',
  UserInfoSubKey = 'UserInfoSubKey',
}

export default class UserInfoDao {
  static has(nameSpace: UserInfoDaoNS): boolean {
    return localStorage.getItem(nameSpace) !== null;
  }

  static get(nameSpace: UserInfoDaoNS): string {
    return localStorage.getItem(nameSpace) || '';
  }

  static save(nameSpace: UserInfoDaoNS, style: string) {
    localStorage.setItem(nameSpace, style);
  }

  static clear() {
    localStorage.removeItem(UserInfoDaoNS.UserInfoUid);
    localStorage.removeItem(UserInfoDaoNS.UserInfoSession);
    localStorage.removeItem(UserInfoDaoNS.UserInfoImgKey);
    localStorage.removeItem(UserInfoDaoNS.UserInfoSubKey);
  }
}
