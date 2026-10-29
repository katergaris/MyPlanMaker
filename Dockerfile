FROM python:3.13-slim
WORKDIR /app
COPY server/ server/
COPY web/ web/
ENV MPM_PORT=8099 MPM_DATA=/data
VOLUME /data
EXPOSE 8099
HEALTHCHECK --interval=60s --timeout=5s CMD python3 -c "import urllib.request,os; urllib.request.urlopen(f'http://127.0.0.1:{os.environ[\"MPM_PORT\"]}/api/ping')" || exit 1
CMD ["python3", "server/server.py"]
