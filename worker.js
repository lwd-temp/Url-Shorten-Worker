const config = {
  old_no_ref: "off", //Control the HTTP referrer header, if you want to create an anonymous link that will hide the HTTP Referer header, please set to "on" . 这会利用一个HTML页面实现 no-referrer 跳转。
  new_no_ref: "on", //这会构建一个有"Referrer-Policy": "no-referrer"头的302跳转。
  cors: "off", //Allow Cross-origin resource sharing for API requests.
  unique_link: false, //If it is true, the same long url will be shorten into the same short url
  custom_link: true, //Allow users to customize the short url.
  protected_path: [
    "favicon.ico",
    "robots.txt",
    "index.html",
    "/",
    "/index.html",
    "/robots.txt",
    "/favicon.ico",
  ], // Not allowed path
  chars_not_allowed_in_path: ["/", "?", '"', "<", ">", "%", "#"], // Not allowed chars in path
};

// 需要在环境变量配置 PASSWORD 才能正常运行

const html404 = `<!DOCTYPE html>
<html>
  <body>
    <h1>404 Not Found.</h1>
    <p>The url you visit is not found.</p>
    <p>
      <a
        href="https://github.com/lwd-temp/Url-Shorten-Worker/tree/crazypeace-mod"
        target="_self"
        >Fork me on GitHub</a
      >
    </p>
  </body>
</html>`;

const robotstxt = `User-agent: *
Disallow: /`;

let response_header = {
  "content-type": "text/html;charset=UTF-8",
};

if (config.cors == "on") {
  response_header = {
    "content-type": "text/html;charset=UTF-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST",
  };
}

async function randomString(len) {
  len = len || 6;
  let $chars =
    "ABCDEFGHJKMNPQRSTWXYZabcdefhijkmnprstwxyz2345678"; /****默认去掉了容易混淆的字符oOLl,9gq,Vv,Uu,I1****/
  let maxPos = $chars.length;
  let result = "";
  for (i = 0; i < len; i++) {
    result += $chars.charAt(Math.floor(Math.random() * maxPos));
  }
  return result;
}

async function sha512(url) {
  url = new TextEncoder().encode(url);

  const url_digest = await crypto.subtle.digest(
    {
      name: "SHA-512",
    },
    url // The data you want to hash as an ArrayBuffer
  );
  const hashArray = Array.from(new Uint8Array(url_digest)); // convert buffer to byte array
  const hashHex = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  //console.log(hashHex)
  return hashHex;
}
async function checkURL(URL) {
  let str = URL;
  let Expression = /http(s)?:\/\/([\w-]+\.)+[\w-]+(\/[\w- .\/?%&=]*)?/;
  let objExp = new RegExp(Expression);
  if (objExp.test(str) == true) {
    if (str[0] == "h") return true;
    else return false;
  } else {
    return false;
  }
}
async function save_url(URL) {
  let random_key = await randomString();
  let is_exist = await LINKS.get(random_key);
  console.log(is_exist);
  if (is_exist == null) return await LINKS.put(random_key, URL), random_key;
  else save_url(URL);
}
async function is_url_exist(url_sha512) {
  let is_exist = await LINKS.get(url_sha512);
  console.log(is_exist);
  if (is_exist == null) {
    return false;
  } else {
    return is_exist;
  }
}
async function get_all_links() {
  // https://developers.cloudflare.com/kv/api/list-keys/
  let dict = {};
  let keys_list = await LINKS.list(); // 1000 is the maximum number of keys returned. 不建议将此项目用于同时超过1000个key的生产环境
  // key是keys_list["keys"]中每个字典的name
  for (let i = 0; i < keys_list["keys"].length; i++) {
    let key = keys_list["keys"][i]["name"];
    let value = await LINKS.get(key);
    dict[key] = value;
  }
  return dict;
}
async function handleRequest(request) {
  console.log(request);

  // 环境变量配置 PASSWORD
  const password_value = PASSWORD;

  if (request.method === "POST") {
    let req = await request.json();
    let req_cmd = req["cmd"];
    if (req_cmd == "add") {
      let req_url = req["url"];
      let req_keyPhrase = req["keyPhrase"];
      let req_password = req["password"];

      console.log(req_url);
      console.log(req_keyPhrase);
      console.log(req_password);
      if (!(await checkURL(req_url))) {
        return new Response(
          JSON.stringify({
            status: 500,
            key: req_url,
            error: "Error: URL illegal.",
          }),
          {
            headers: response_header,
          }
        );
      }

      if (req_password != password_value) {
        return new Response(
          JSON.stringify({
            status: 500,
            key: req_url,
            error: "Error: Invalid password.",
          }),
          {
            headers: response_header,
          }
        );
      }

      let stat, random_key;
      if (config.custom_link && req_keyPhrase != "") {
        // Check for protected path
        if (config.protected_path.includes(req_keyPhrase)) {
          return new Response(
            JSON.stringify({
              status: 500,
              key: req_keyPhrase,
              error: "Error: Protected path.",
            }),
            {
              headers: response_header,
            }
          );
        }
        // Check for Not allowed chars in path
        for (let i = 0; i < config.chars_not_allowed_in_path.length; i++) {
          if (req_keyPhrase.includes(config.chars_not_allowed_in_path[i])) {
            return new Response(
              JSON.stringify({
                status: 500,
                key: req_keyPhrase,
                error: "Error: Not allowed chars in path.",
              }),
              {
                headers: response_header,
              }
            );
          }
        }
        // Check for existed key
        let is_exist = await LINKS.get(req_keyPhrase);
        if (is_exist != null) {
          return new Response(
            JSON.stringify({
              status: 500,
              key: req_keyPhrase,
              error: "Error: Custom shortURL existed.",
            }),
            {
              headers: response_header,
            }
          );
        } else {
          random_key = req_keyPhrase;
          stat, await LINKS.put(req_keyPhrase, req_url);
        }
      } else if (config.unique_link) {
        let url_sha512 = await sha512(req_url);
        let url_key = await is_url_exist(url_sha512);
        if (url_key) {
          random_key = url_key;
        } else {
          stat, (random_key = await save_url(req_url));
          if (typeof stat == "undefined") {
            console.log(await LINKS.put(url_sha512, random_key));
          }
        }
      } else {
        stat, (random_key = await save_url(req_url));
      }
      console.log(stat);
      if (typeof stat == "undefined") {
        return new Response(
          JSON.stringify({
            status: 200,
            key: random_key,
            error: "",
          }),
          {
            headers: response_header,
          }
        );
      } else {
        return new Response(
          JSON.stringify({
            status: 500,
            key: "",
            error: "Error: Reach the KV write limitation.",
          }),
          {
            headers: response_header,
          }
        );
      }
    } else if (req_cmd == "del") {
      let req_keyPhrase = req["keyPhrase"];
      let req_password = req["password"];

      if (req_password != password_value) {
        return new Response(
          JSON.stringify({
            status: 500,
            key: "",
            error: "Error: Invalid password.",
          }),
          {
            headers: response_header,
          }
        );
      }

      await LINKS.delete(req_keyPhrase);
      return new Response(
        JSON.stringify({
          status: 200,
          key: req_keyPhrase,
          error: "",
        }),
        {
          headers: response_header,
        }
      );
    } else if (req_cmd == "list") {
      let req_password = req["password"];

      if (req_password != password_value) {
        return new Response(
          JSON.stringify({
            status: 500,
            key: "",
            error: "Error: Invalid password.",
          }),
          {
            headers: response_header,
          }
        );
      }
      let dict = await get_all_links();
      return new Response(
        JSON.stringify({
          status: 200,
          key: dict,
          error: "",
        }),
        {
          headers: response_header,
        }
      );
    }
  } else if (request.method === "OPTIONS") {
    return new Response(``, {
      headers: response_header,
    });
  }

  const requestURL = new URL(request.url);
  const path = requestURL.pathname.split("/")[1];
  const params = requestURL.search;

  console.log(path);

  // 若为robots.txt
  if (path == "robots.txt") {
    const html = robotstxt;
    return new Response(await html, {
      headers: {
        "content-type": "text/plain;charset=UTF-8",
      },
    });
  }

  // 如果path为空，则显示 index.html
  // PASSWORD 永远不应该出现在 GET 请求中
  if (path == "") {
    let index = await fetch(
      "https://raw.githubusercontent.com/lwd-temp/Url-Shorten-Worker/crazypeace-mod/index.html"
    );
    index = await index.text();
    // index = index.replace(/__PASSWORD__/gm, password_value) // 自动填写密码，不建议使用
    index = index.replace(/__PASSWORD__/gm, ""); // 将模板中的占位密码删除
    return new Response(index, {
      headers: {
        "content-type": "text/html;charset=UTF-8",
      },
    });
  }

  const value = await LINKS.get(path);
  let location;

  if (params) {
    location = value + params;
  } else {
    location = value;
  }
  console.log(value);

  if (location) {
    if (config.no_ref == "on") {
      let no_ref = await fetch(
        "https://raw.githubusercontent.com/lwd-temp/Url-Shorten-Worker/crazypeace-mod/no-ref.html"
      );
      no_ref = await no_ref.text();
      no_ref = no_ref.replace(/{Replace}/gm, location);
      return new Response(no_ref, {
        headers: {
          "content-type": "text/html;charset=UTF-8",
        },
      });
    } else if (config.new_no_ref == "on") {
      return new Response(null, {
        status: 302,
        headers: {
          Location: location,
          "Referrer-Policy": "no-referrer",
        },
      });
    } else {
      return Response.redirect(location, 302);
    }
  }
  // If request not in kv, return 404
  return new Response(html404, {
    headers: {
      "content-type": "text/html;charset=UTF-8",
    },
    status: 404,
  });
}

addEventListener("fetch", async (event) => {
  event.respondWith(handleRequest(event.request));
});
