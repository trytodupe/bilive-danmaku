import nodeFetch from 'node-fetch';
import {Md5} from 'ts-md5';
import UserAvatarDao from '../dao/UserAvatarDao';
import { CmdType } from '../components/Danmaku/MsgModel';
import LiveRoomDao, { LiveRoomData } from '../dao/LiveRoomDao';
import pkg from '../../../package.json';
import config from '../config';
import UserInfoDao, { UserInfoDaoNS } from '../dao/UesrInfoDao';
import i18n from '../i18n';

export interface SessionInfo {
  uid: number;
  session: string;
  img_key: string;
  sub_key: string;
}

export interface UserInfo {
  face: string;
  level: number;
  mid: number;
  name: string;
}

export interface LiveRoom {
  roomid: number;
  shortid: number;
  uid: number;
  uname: string;
  face: string;
  title: string;
  isLive: boolean;
}

export interface LiveRoomInfoResponse {
  data?: {
    // 主播信息
    anchor_info: {
      base_info: {
        face: string;
        uname: string;
      };
    };
    // 直播间信息
    room_info: {
      uid: number;
      room_id: number;
      live_status: 0 | 1;
      short_id: 0 | number;
      title: string;
    };
  };
  message: string;
}

export interface ResentSuperChatResponse {
  code: 0 | number;
  data: {
    message_list: SUPER_CHAT_MESSAGE_DATA[];
  };
}

export interface RankMessageListsItem {
  certification_mark: number;
  face: string;
  face_frame: string;
  guard_level: number;
  is_self: number;
  message: string;
  price: number;
  ranked_icon: string;
  send_time: number;
  uid: number;
  uname: string;
}

export interface RankMessageListsResponse {
  code: number;
  data: {
    list?: RankMessageListsItem[];
  };
  message: string;
  msg: string;
}

export interface HostItem {
  // "host": "zj-cn-live-comet.chat.bilibili.com",
  // "port": 2243,
  // "wss_port": 2245,
  // "ws_port": 2244
  host: string;
  port: number;
  wss_port: number;
  ws_port: number;
}

export interface DanmuInfoData {
  token: string;
  host_list: HostItem[];
}

export interface DanmuInfoResponse {
  code: number;
  data: DanmuInfoData;
  message: string;
  msg: string;
}

const API_USER_INFO = 'https://api.bilibili.com/x/space/acc/info';
const API_LIVEROOM_INFO =
  'https://api.live.bilibili.com/xlive/web-room/v1/index/getInfoByRoom';
const API_GIFT_CONFIG = `https://api.live.bilibili.com/gift/v3/live/gift_config`;
const API_RESENT_SUPER_CHAT = `https://api.live.bilibili.com/av/v1/SuperChat/enable`;
const API_RANK_MESSAGE_LIST = `https://api.live.bilibili.com/av/v1/SuperChat/getRankMessageList`;
const API_DANMU_INFO = `https://api.live.bilibili.com/xlive/web-room/v1/index/getDanmuInfo`;
const API_FINGER_SPI = `https://api.bilibili.com/x/frontend/finger/spi/`;
const API_SERVER_PACKAGE = `https://cdn.jsdelivr.net/gh/beats0/bilive-danmaku/package.json`;
const API_SESSION_INFO = `https://api.bilibili.com/x/web-interface/nav`;

// wbi相关
const MixinKeyEncTab = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
  33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40,
  61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11,
  36, 20, 34, 44, 52
];
const getMixinKey = (orig: string) => MixinKeyEncTab.map(n => orig[n]).join('').slice(0, 32);
const encWbi = (
  params: Record<string, string | number>, 
  img_key: string,
  sub_key: string
):string => {
  const mixin_key = getMixinKey(img_key + sub_key);
  const curr_time = Math.round(Date.now() / 1000);
  const chr_filter = /[!'()*]/g;

  params.wts = curr_time;
  
  const query = Object.keys(params)
    .sort()
    .map((key) => {
      const value = params[key].toString().replace(chr_filter, '');
      return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
    })
    .join('&');
  const wbi_sign = Md5.hashStr(query + mixin_key);
  return query + '&w_rid=' + wbi_sign;
}

// 获取我的信息
export async function getSessionInfoData(
  session: string
): Promise<SessionInfo> {
  const userSessionFormat = `SESSDATA=${session};`;
  const response = await nodeFetch(API_SESSION_INFO, {
    method: 'GET',
    headers: {
      Cookie: userSessionFormat,
    },
  });
  const sessionInfo: SessionInfo = {
    uid: 0,
    session,
    img_key: "",
    sub_key: "",
  };
  try {
    const data = await response.json();
    if (data.code === 0) {
      sessionInfo.uid = data.data.mid;
      const img_url = data.data.wbi_img.img_url;
      const sub_url = data.data.wbi_img.sub_url;
      sessionInfo.img_key = img_url.slice(
        img_url.lastIndexOf('/') + 1,
        img_url.lastIndexOf('.')
      );
      sessionInfo.sub_key = sub_url.slice(
        sub_url.lastIndexOf('/') + 1,
        sub_url.lastIndexOf('.')
      );
    }
  } catch (e) {
    console.log('[error]', e);
  }
  return sessionInfo;
}

// 获取用户信息
export async function getUserInfo(mid: number): Promise<UserInfo> {
  const defaultUserInfo: UserInfo = {
    face: 'https://static.hdslb.com/images/member/noface.gif',
    level: 0,
    mid,
    name: ''
  };

  return new Promise<UserInfo>((resolve, reject) => {
    // 被ban后不再请求api
    if (config.showAvatar === 0) {
      resolve(defaultUserInfo);
      return;
    }
    fetch(`${API_USER_INFO}?mid=${mid}`)
      .then(res => {
        // 如果检测到被ban后自动关闭显示头像功能
        if (res.status === 412) {
          console.warn('显示头像功能已关闭, 请稍后再试...');
          config.showAvatar = 0;
          return resolve(defaultUserInfo);
        }
        return res.json();
      })
      .then(res => {
        // 保存avatar
        UserAvatarDao.save(mid, res.data.face);
        resolve(res.data);
      })
      .catch(e => {
        console.log(e);
        resolve(defaultUserInfo);
      });
  });
}

// 获取礼物数据
export async function getGiftInfo(): Promise<Map<number, GiftRaw>> {
  const giftMap = new Map<number, GiftRaw>();
  return new Promise((resolve, reject) => {
    fetch(API_GIFT_CONFIG)
      .then(res => res.json())
      .then((res: { msg: string; data: any[] }) => {
        if (res.code === 0) {
          const { data } = res;
          for (let i = 0; i < data.length; i++) {
            giftMap.set(data[i].id, data[i]);
          }
          resolve(giftMap);
        }
      })
      .catch(error => {
        console.log(error);
        resolve(giftMap);
      });
  });
}

// 获取直播间信息
export async function getLiveRoomInfo(roomid: number): Promise<LiveRoom> {
  return new Promise<LiveRoom>((resolve, reject) => {
    fetch(`${API_LIVEROOM_INFO}?room_id=${roomid}`)
      .then(res => res.json())
      .then((data: LiveRoomInfoResponse) => {
        // 直播间加密等情况是没有数据的
        if (!data.data) throw new Error(data.message);

        const { face, uname } = data.data.anchor_info.base_info;
        const {
          uid,
          room_id,
          short_id,
          title,
          live_status
        } = data.data.room_info;
        const liveRoomDaoData: LiveRoomData = {
          uid,
          roomid: room_id,
          shortid: short_id || room_id,
          lastTime: Date.now()
        };
        // 保存到dao
        LiveRoomDao.save(liveRoomDaoData);
        const liveRoomData: LiveRoom = {
          roomid: room_id,
          shortid: short_id || room_id,
          uid,
          uname,
          face,
          title,
          isLive: live_status === 1
        };
        resolve(liveRoomData);
      })
      .catch(error => {
        console.log('error', error);
        const liveRoomData: LiveRoom = {
          roomid,
          shortid: roomid,
          uid: 0,
          uname: roomid.toString(),
          face: 'https://static.hdslb.com/images/member/noface.gif',
          title: error.message,
          isLive: false
        };
        resolve(liveRoomData);
      });
  });
}

// 获取留言榜
export async function getRankMessageList(
  roomid: number
): Promise<RankMessageListsItem[]> {
  return new Promise<RankMessageListsItem[]>(async (resolve, reject) => {
    const ruid = (await getLiveRoomInfo(roomid)).uid;
    fetch(`${API_RANK_MESSAGE_LIST}?room_id=${roomid}&ruid=${ruid}`)
      .then((res) => res.json())
      .then((data: RankMessageListsResponse) => {
        let list: RankMessageListsItem[] = [];
        if (data.code === 0 && data.data.list) {
          list = data.data.list;
        }
        resolve(list);
      })
      .catch((e) => {
        resolve([]);
      });
  });
}

// 获取直播间最近SC
export async function getResentSuperChat(
  roomid: number
): Promise<SUPER_CHAT_MESSAGE[]> {
  return new Promise<SUPER_CHAT_MESSAGE[]>((resolve, reject) => {
    fetch(`${API_RESENT_SUPER_CHAT}?room_id=${roomid}`)
      .then(res => res.json())
      .then((data: ResentSuperChatResponse) => {
        if (data.code !== 0) {
          resolve([]);
        } else {
          const lists = data.data.message_list;
          const scLists: SUPER_CHAT_MESSAGE[] = [];
          for (let i = 0; i < lists.length; i++) {
            const sc: SUPER_CHAT_MESSAGE = {
              cmd: CmdType.SUPER_CHAT_MESSAGE,
              data: lists[i]
            };
            scLists.push(sc);
          }
          resolve(scLists);
        }
      })
      .catch(error => {
        console.log('error', error);
        resolve([]);
      });
  });
}

// 获取danmuInfo
export async function getDanmuInfoData(roomid: number): Promise<DanmuInfoData | null> {
  return new Promise<DanmuInfoData>(async (resolve, reject) => {
    const userInfoSessionStr = UserInfoDao.get(UserInfoDaoNS.UserInfoSession);
    const userInfoImgKeyStr = UserInfoDao.get(UserInfoDaoNS.UserInfoImgKey);
    const userInfoSubKeyStr = UserInfoDao.get(UserInfoDaoNS.UserInfoSubKey);
    const params = { id: `${roomid}`, type: '0'};
    const query = encWbi(params, userInfoImgKeyStr, userInfoSubKeyStr);
    const buvid3 = await getBuvid3();
    const buvid4 = await getBuvid4();
    const cookies = [
      userInfoSessionStr ? `SESSDATA=${userInfoSessionStr}` : userInfoSessionStr,
      buvid3 ? `buvid3=${buvid3}` : buvid3,
      buvid4 ? `buvid4=${buvid4}` : buvid4,
    ].join('; ');
    const headers = {
      Cookie: cookies,
    };
    nodeFetch(`${API_DANMU_INFO}?${query}`, {
      method: 'GET',
      headers,
    })
      .then((res) => res.json())
      .then((data: DanmuInfoResponse) => {
        if (headers.Cookie) {
          if (!data.data) {
            window.alert(i18n.t('SessionError'));
          }
        }
        if (!data.data) {
          console.log('[error]', data);
          resolve(null);
          return;
        }
        const danmuInfoData: DanmuInfoData = data.data;
        resolve(danmuInfoData);
      })
      .catch((error) => {
        console.log('error', error);
        window.alert(i18n.t('SessionError'));
        resolve(null);
      });
  });
}

// 获取buvid3
export async function getBuvid3(): Promise<string> {
  const userInfoSessionStr = UserInfoDao.get(UserInfoDaoNS.UserInfoSession);
  const headers = {
    Cookie: userInfoSessionStr
      ? `SESSDATA=${userInfoSessionStr};`
      : userInfoSessionStr,
  };
  const response = await nodeFetch(API_FINGER_SPI, {
    method: 'GET',
    headers,
  });
  const data = await response.json();
  if (data.code === 0) {
    const buvid3 = data.data.b_3;
    return buvid3;
  }
  return '';
}

// 获取buvid4
export async function getBuvid4(): Promise<string> {
  const userInfoSessionStr = UserInfoDao.get(UserInfoDaoNS.UserInfoSession);
  const headers = {
    Cookie: userInfoSessionStr
      ? `SESSDATA=${userInfoSessionStr};`
      : userInfoSessionStr,
  };
  const response = await nodeFetch(API_FINGER_SPI, {
    method: 'GET',
    headers,
  });
  const data = await response.json();
  if (data.code === 0) {
    const buvid4 = data.data.b_4;
    return buvid4;
  }
  return '';
}

// 获取服务器端version
export async function getVersionInfo(): Promise<string> {
  return new Promise((resolve, reject) => {
    fetch(API_SERVER_PACKAGE)
      .then(res => res.json())
      .then((res: { version: string }) => {
        resolve(res.version);
      })
      .catch(error => {
        console.log(error);
        resolve(pkg.version);
      });
  });
}

type Task = {
  uid: number;
};

const taskQueue: Task[] = [];
let isWorking = false;

// 设置最大请求数5个，每次请求下一个间隔时间为200ms
export const apiTaskConfig = {
  taskMaxLength: 5,
  sleepMs: 200,
};

async function handleTaskQueue() {
  isWorking = true;
  const task = taskQueue.shift();
  if (task) {
    await getUserInfo(task.uid);
    await handleTaskQueue();
  } else {
    isWorking = false;
  }
}

// 用户信息任务
const UserInfoApiTask = {
  push(uid: number) {
    if (taskQueue.length > apiTaskConfig.taskMaxLength) return;
    if (taskQueue.some(t => t.uid === uid)) return;
    taskQueue.push({ uid });
    if (!isWorking) {
      handleTaskQueue();
    }
  },
  getTaskQueueLength(): number {
    return taskQueue.length;
  }
};

export default UserInfoApiTask;
